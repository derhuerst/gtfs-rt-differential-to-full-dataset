'use strict'

const {ok} = require('assert')
const schema = require('gtfs-rt-bindings/gtfs-realtime.schema.json')
const {varint} = require('protocol-buffers-encodings')
const {FeedEntity, FeedHeader, FeedMessage} = require('gtfs-rt-bindings')
const {add, remove} = require('sorted-array-functions')

const gtfsRt = schema.nested.transit_realtime.nested
const feedMsgFields = gtfsRt.FeedMessage.fields
const FEED_MSG_HEADER = feedMsgFields.header.id
const FEED_MSG_ENTITIES = feedMsgFields.entity.id

// https://developers.google.com/protocol-buffers/docs/encoding#structure
const LENGTH_DELIMITED = 2

// https://developers.google.com/protocol-buffers/docs/encoding#structure
const encodeField = (fieldNumber, wireType, dataLength) => {
	// If I'm not wrong, 4 bytes of varint allow for 268.435.456b
	// ~= 217mb of (payload) data.
	const buf = Buffer.allocUnsafeSlow(1 + 4)
	let offset = 0
	buf[offset++] = (fieldNumber << 3 | wireType)
	varint.encode(dataLength, buf, offset)
	offset += varint.encode.bytes
	return buf.slice(0, offset)
}

const entityTimestamp = (entity) => {
	if (entity.trip_update && Number.isInteger(entity.trip_update.timestamp)) {
		return entity.trip_update.timestamp
	}
	if (entity.vehicle && Number.isInteger(entity.vehicle.timestamp)) {
		return entity.vehicle.timestamp
	}
	// A FeedEntity may also contain an Alert, but that doesn't have a timestamp.
	return NaN
}

const createEntitiesStore = (now) => {
	const timers = new Map()
	const datas = new Map()
	const fields = new Map()
	let timestamps = []
	const timestampsById = new Map()
	let cache = null // cached final `FeedMessage` buffer

	const del = (id) => {
		if (!datas.has(id)) return;
		if (timers.has(id)) {
			clearTimeout(timers.get(id))
			timers.delete(id)
		}
		datas.delete(id)
		fields.delete(id)
		if (timestampsById.has(id)) {
			const t = timestampsById.get(id)
			remove(timestamps, t) // only removes *one* occurence
			timestampsById.delete(id)
		}
		cache = null
	}

	const put = (id, entity, expiresAt) => {
		// console.error('put', id, entity) // todo: remove
		del(id)
		cache = null

		if (expiresAt !== null) {
			ok(Number.isInteger(expiresAt), 'expiresAt must be an integer or null')
			const timeLeft = (expiresAt - now()) * 1000
			if(timeLeft <= 0) {
				// already expired, so we don't insert it
				return;
			}
			// > When delay is larger than 2147483647 […], the delay will be set to 1.
			// https://nodejs.org/docs/latest-v18.x/api/timers.html#settimeoutcallback-delay-args
			if (timeLeft <= 2147483647) {
				// todo: use sth more memory-efficient than closures?
				const timer = setTimeout(del, timeLeft, id)
				timers.set(id, timer)
				if (timer && timer.unref) {
					// allow Node.js to exit by not requiring its event loop to remain active
					// note: not available in browsers
					timer.unref()
				}
			}
		}

		FeedEntity.verify(entity)
		const data = FeedEntity.encode(entity).finish()
		datas.set(id, data)

		const field = encodeField(
			FEED_MSG_ENTITIES,
			LENGTH_DELIMITED,
			data.length
		)
		fields.set(id, field)

		let timestamp = entityTimestamp(entity)
		if (!Number.isInteger(timestamp)) timestamp = now()
		add(timestamps, timestamp)
		timestampsById.set(id, timestamp)

		cache = null
	}

	const flush = () => {
		for (const timer of timers.values()) clearTimeout(timer)
		timers.clear()
		datas.clear()
		fields.clear()
		timestamps = []
		timestampsById.clear()
		cache = null
	}

	const nrOfEntities = () => datas.size

	const getTimestamp = () => {
		return timestamps.length > 0
			? timestamps[timestamps.length - 1] // highest
			: now()
	}

	const asFeedMessage = () => {
		if (cache !== null) return cache

		const ids = Array.from(datas.keys())
		const chunks = new Array(2 + ids.length * 2)

		const rawHeader = {
			gtfs_realtime_version: '2.0',
			incrementality: FeedHeader.Incrementality.FULL_DATASET,
			timestamp: getTimestamp(),
			// todo: follow https://github.com/google/transit/pull/434 once it is merged
		}
		FeedHeader.verify(rawHeader)
		const header = chunks[1] = FeedHeader.encode(rawHeader).finish()
		const headerField = chunks[0] = encodeField(
			FEED_MSG_HEADER,
			LENGTH_DELIMITED,
			header.length
		)

		let bytes = headerField.length + header.length
		for (let i = 0; i < ids.length; i++) {
			const id = ids[i]
			const field = fields.get(id)
			const data = datas.get(id)

			chunks[2 + i * 2] = field
			chunks[2 + i * 2 + 1] = data
			bytes += field.length + data.length
		}

		// We might be able to optimize this with a an array of slices
		// from a buffer pool.
		// todo: implement it, benchmark it
		cache = Buffer.concat(chunks, bytes)
		return cache
	}

	return {
		put,
		del,
		flush,
		nrOfEntities,
		getTimestamp,
		asFeedMessage,
	}
}

createEntitiesStore.encodeField = encodeField
module.exports = createEntitiesStore
