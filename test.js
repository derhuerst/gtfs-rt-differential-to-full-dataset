'use strict'

const {strictEqual} = require('assert')
const {FeedHeader, FeedMessage} = require('gtfs-rt-bindings')
const createEntitiesStore = require('./lib/entities-store')
const {encodeField} = createEntitiesStore

const bufEqual = (actual, expected, msg = undefined) => {
	strictEqual(actual.toString('hex'), expected.toString('hex'), msg)
}

bufEqual(encodeField(1, 2, 123456), Buffer.from([10, 192, 196, 7]))

const e1 = {
	id: '1',
	vehicle: {
		trip: {trip_id: '1|30532|17|86|12032020', route_id: 'm10'},
		vehicle: {id: null, label: 'S+U Warschauer Str.'},
		position: {latitude: 52.531513, longitude: 13.38741},
		stop_id: '900000007104',
		current_status: 2
	}
}
const e2 = {
	id: '2',
	vehicle: {
		trip: {trip_id: '1|22921|5|86|12032020', route_id: 'm41'},
		vehicle: {id: null, label: 'Sonnenallee/Baumschulenstr.'},
		position: {latitude: 52.497561, longitude: 13.394512},
		stop_id: '900000012152',
		current_status: 2
	}
}
const e3 = {
	id: '130',
	vehicle: {
		trip: {trip_id: '1|33296|7|86|12032020', route_id: 'u3'},
		vehicle: {id: null, label: 'U Gleisdreieck'},
		position: {latitude: 52.498658, longitude: 13.35797},
		stop_id: '900000056104',
		current_status: 2
	}
}

const header = {
	gtfs_realtime_version: '2.0',
	incrementality: FeedHeader.Incrementality.DIFFERENTIAL,
	timestamp: Date.now() / 1000 | 0, // this will fail every 1/1000th time
}

const feedMsgEqual = (store, entities) => {
	const actual = s.asFeedMessage()
	const expected = FeedMessage.encode({header, entity: entities})
	bufEqual(actual, expected)
}

const s = createEntitiesStore()
s.put('foo', e1)
s.put('bar', e2)
feedMsgEqual(s, [e1, e2])

s.put('baz', e3)
feedMsgEqual(s, [e1, e2, e3])

s.put('foo', e3)
feedMsgEqual(s, [e2, e3, e3])

s.del('bar')
feedMsgEqual(s, [e3, e3])

s.flush()
feedMsgEqual(s, [])
