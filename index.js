'use strict'

const {FeedHeader} = require('gtfs-rt-bindings')
const {Writable} = require('stream')
const createEntitiesStore = require('./lib/entities-store')

const {DIFFERENTIAL} = FeedHeader.Incrementality

class UnsupportedFeedMessageError extends Error {}

class UnsupportedKindOfFeedEntityError extends Error {}

class FeedEntitySignatureError extends Error {}

const tripSignature = (u) => {
	if (u.trip.trip_id && u.trip.start_date) {
		return u.trip.trip_id + '-' + u.trip.start_date
	}
	if (u.trip.route_id && u.vehicle.id) {
		return u.trip.route_id + '-' + u.vehicle.id
	}
	// todo: u.trip.route_id + slugg(u.vehicle.label) ?
	return null
}

const gtfsRtDifferentialToFullDataset = (opt = {}) => {
	const {
		ttl: defaultTtlMs,
		timestamp: getNow,
		tripUpdateSignature,
		vehiclePositionSignature,
	} = {
		ttl: 5 * 60 * 1000, // 5 minutes
		timestamp: () => Date.now() / 1000 | 0,
		tripUpdateSignature: (u) => {
			const tripSig = tripSignature(u)
			return tripSig ? 'trip_update-' + tripSig : null
		},
		vehiclePositionSignature: (p) => {
			const vehicleSig = p.vehicle && p.vehicle.id
			if (vehicleSig) return 'vehicle_position-' + vehicleSig
			const tripSig = tripSignature(p)
			return tripSig ? 'vehicle_position-' + tripSig : null
		},
		...opt
	}
	const defaultTtl = Math.round(defaultTtlMs / 1000)

	const entityExpiresAt = (entity) => {
		return getNow() + defaultTtl
	}

	const entitiesStore = createEntitiesStore(getNow)

	const processFeedEntity = (entity) => {
		// If the entity is not being deleted, exactly one of 'trip_update', 'vehicle' and 'alert' fields should be populated.
		// https://developers.google.com/transit/gtfs-realtime/reference#message-feedentity
		let sig = null
		if (entity.trip_update) {
			sig = tripUpdateSignature(entity.trip_update)
		} else if (entity.vehicle) {
			sig = vehiclePositionSignature(entity.vehicle)
		} else if (entity.alert) {
			// todo: see #1
		} else {
			const err = new UnsupportedKindOfFeedEntityError('invalid/unsupported kind of FeedEntity')
			err.feedEntity = entity
			throw err
		}

		if (sig !== null) {
			const expiresAt = entityExpiresAt(entity)
			entitiesStore.put(sig, entity, expiresAt)
			return;
		}
		const err = new FeedEntitySignatureError('could not determine FeedEntity signature')
		err.feedEntity = entity
		throw err
	}
	const processFeedMessage = (msg) => {
		if (msg.header.gtfs_realtime_version !== '2.0') {
			const err = new UnsupportedFeedMessageError('FeedMessage GTFS-RT version must be 2.0')
			err.feedMessage = msg
			throw err
		}
		if (msg.header.incrementality !== DIFFERENTIAL) {
			const err = new UnsupportedFeedMessageError('FeedMessage must be DIFFERENTIAL')
			err.feedMessage = msg
			throw err
		}
		for (const entity of msg.entity) {
			processFeedEntity(entity)
		}
	}

	let feedMessage = null
	const asFeedMessage = () => {
		return feedMessage || entitiesStore.asFeedMessage()
	}

	const out = new Writable({
		objectMode: true,
		write: (feedMsg, _, cb) => {
			processFeedMessage(feedMsg)
			out.emit('change')
			cb(null)
		},
		writev: (chunks, cb) => {
			for (const {chunk: feedMsg} of chunks) processFeedMessage(feedMsg)
			out.emit('change')
			cb(null)
		},
		final: (cb) => {
			feedMessage = entitiesStore.asFeedMessage()
			entitiesStore.flush()
			cb(null)
		},
	})

	out.asFeedMessage = asFeedMessage
	// todo: let asFeedMessage return this
	out.timeModified = () => entitiesStore.getTimestamp()
	out.nrOfEntities = entitiesStore.nrOfEntities

	// todo [breaking]: change return value to a regular object
	return out
}

module.exports = {
	gtfsRtDifferentialToFullDataset,
	UnsupportedFeedMessageError,
	UnsupportedKindOfFeedEntityError,
	FeedEntitySignatureError,
}
