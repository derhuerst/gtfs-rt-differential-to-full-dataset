'use strict'

const {Writable} = require('stream')
const createEntitiesStore = require('./lib/entities-store')

const tripSignature = (u) => {
	if (u.trip.trip_id) return u.trip.trip_id
	if (u.trip.route_id && u.vehicle.id) {
		return u.trip.route_id + '-' + u.vehicle.id
	}
	// todo: u.trip.route_id + slugg(u.vehicle.label) ?
	return null
}
const tripUpdateSignature = (u) => {
	const tripSig = tripSignature(u)
	return tripSig ? 'trip_update-' + tripSig : null
}
const vehiclePositionSignature = (u) => {
	const tripSig = tripSignature(u)
	return tripSig ? 'vehicle_position-' + tripSig : null
}

const gtfsRtAsDump = (opt = {}) => {
	const {
		ttl,
		timestamp,
	} = {
		ttl: 5 * 60 * 1000, // 5 minutes
		timestamp: () => Date.now() / 1000 | 0,
		...opt
	}

	const entitiesStore = createEntitiesStore(ttl, timestamp)

	const write = (entity) => {
		// If the entity is not being deleted, exactly one of 'trip_update', 'vehicle' and 'alert' fields should be populated.
		// https://developers.google.com/transit/gtfs-realtime/reference#message-feedentity
		let sig = null
		if (entity.trip_update) {
			sig = tripUpdateSignature(entity.trip_update)
		} else if (entity.vehicle) {
			sig = vehiclePositionSignature(entity.vehicle)
		}
		// todo: alert

		if (sig !== null) {
			entitiesStore.put(sig, entity)
			return;
		}
		const err = new Error('invalid/unsupported kind of FeedEntity')
		err.feedEntity = entity
		throw err
	}

	let feedMessage = null
	const asFeedMessage = () => {
		return feedMessage || entitiesStore.asFeedMessage()
	}

	const out = new Writable({
		objectMode: true,
		write: (entity, _, cb) => {
			write(entity)
			cb(null)
		},
		writev: (chunks, cb) => {
			for (const {chunk: entity} of chunks) write(entity)
			cb(null)
		},
		final: (cb) => {
			feedMessage = entitiesStore.asFeedMessage()
			entitiesStore.flush()
			cb(null)
		},
	})

	out.asFeedMessage = asFeedMessage
	return out
}

module.exports = gtfsRtAsDump
