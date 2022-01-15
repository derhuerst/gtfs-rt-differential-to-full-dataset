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

const gtfsRtAsDump = (opt = {}) => {
	const {
		ttl,
		timestamp,
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
			out.emit('change')
			cb(null)
		},
		writev: (chunks, cb) => {
			for (const {chunk: entity} of chunks) write(entity)
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
	return out
}

module.exports = gtfsRtAsDump
