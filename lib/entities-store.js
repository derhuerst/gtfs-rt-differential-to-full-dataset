'use strict'

const schema = require('gtfs-rt-bindings/schema.json')
const {varint} = require('protocol-buffers-encodings')
const {FeedEntity, FeedHeader, FeedMessage} = require('gtfs-rt-bindings')

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

const createEntitiesStore = (ttl, timestamp) => {
	let timers = new Map()
	let datas = new Map()
	let fields = new Map()
	let cache = null // cached final `FeedMessage` buffer

	const del = (id) => {
		if (!timers.has(id)) return;
		clearTimeout(timers.get(id))
		timers.delete(id)
		datas.delete(id)
		fields.delete(id)
		cache = null
	}

	const put = (id, entity) => {
		del(id)
		cache = null

		// todo: use sth more memory-efficient than closures?
		timers.set(id, setTimeout(() => {
			remove(id)
		}, ttl))

		const data = FeedEntity.encode(entity)
		datas.set(id, data)

		const field = encodeField(
			FEED_MSG_ENTITIES,
			LENGTH_DELIMITED,
			data.length
		)
		fields.set(id, field)
	}

	const flush = () => {
		for (const timer of timers.values()) clearTimeout(timer)
		timers = new Map()
		datas = new Map()
		fields = new Map()
		cache = null
	}

	const nrOfEntities = () => timers.size

	const asFeedMessage = () => {
		if (cache !== null) return cache

		const ids = Array.from(timers.keys())
		const chunks = new Array(2 + ids.length * 2)

		const header = chunks[1] = FeedHeader.encode({
			gtfs_realtime_version: '2.0',
			incrementality: FeedHeader.Incrementality.DIFFERENTIAL,
			timestamp: timestamp(),
		})
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
		asFeedMessage,
	}
}

createEntitiesStore.encodeField = encodeField
module.exports = createEntitiesStore
