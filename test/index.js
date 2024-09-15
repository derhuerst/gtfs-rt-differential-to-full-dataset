'use strict'

const {strictEqual} = require('assert')
const {FeedHeader, FeedMessage} = require('gtfs-rt-bindings')
const pump = require('pump')
const {createReadStream} = require('fs')
const {join} = require('path')
const {parse} = require('ndjson')
const createEntitiesStore = require('../lib/entities-store')
const {
	gtfsRtDifferentialToFullDataset,
} = require('..')
const {encodeField} = createEntitiesStore

const delay = ms => new Promise(r => setTimeout(r, ms))

const bufEqual = (actual, expected, msg = undefined) => {
	// console.error('bufEqual', actual, expected)
	strictEqual(actual.toString('hex'), expected.toString('hex'), msg)
}

bufEqual(encodeField(1, 2, 123456), Buffer.from([10, 192, 196, 7]))

console.info('1..1')

const ttl = 5 * 60 * 1000 // 5 minutes
const timestamp = () => 1

const e1 = {
	id: '1',
	vehicle: {
		trip: {
			trip_id: '1|30532|17|86|12032020',
			route_id: 'm10',
			start_date: '20200312',
		},
		vehicle: {id: null, label: 'S+U Warschauer Str.'},
		position: {latitude: 52.531513, longitude: 13.38741},
		stop_id: '900000007104',
		current_status: 2,
		timestamp: 1634026310, // 2021-10-12T10:11:50+02:00
	}
}
const e2 = {
	id: '2',
	vehicle: {
		trip: {
			trip_id: '1|22921|5|86|12032020',
			route_id: 'm41',
			start_date: '20200312',
		},
		vehicle: {id: null, label: 'Sonnenallee/Baumschulenstr.'},
		position: {latitude: 52.497561, longitude: 13.394512},
		stop_id: '900000012152',
		current_status: 2,
		timestamp: 1634026290, // 2021-10-12T10:11:30+02:00
	}
}
const e3 = {
	id: '130',
	trip_update: {
		trip: {
			trip_id: '1|33296|7|86|12032020',
			route_id: 'u3',
			start_date: '20200312',
		},
		vehicle: {id: null, label: 'U Gleisdreieck'},
		stop_time_update: [
			{stop_id: '900000041101', departure: {delay: 60}},
		],
		timestamp: 1634026320, // 2021-10-12T10:12:00+02:00
	}
}

const header = {
	gtfs_realtime_version: '2.0',
	incrementality: FeedHeader.Incrementality.FULL_DATASET,
}

const feedMsgEqual = (store, entities, feedTimestamp, testName) => {
	const actual = store.asFeedMessage()
	const expected = FeedMessage.encode({
		header: {
			...header,
			timestamp: feedTimestamp,
		},
		entity: entities,
	}).finish()
	bufEqual(actual, expected, testName + ': encoded feed should be equal')

	const feedMsg = FeedMessage.toObject(FeedMessage.decode(actual))
	strictEqual(+feedMsg.header.timestamp, feedTimestamp, testName + ': feed timestamp should be equal')
	strictEqual(store.getTimestamp(), feedTimestamp, testName + ': store.getTimestamp() should be correct')
}

const store = createEntitiesStore(ttl, timestamp)
feedMsgEqual(store, [], timestamp(), 'init')

store.put('foo', e1)
feedMsgEqual(store, [e1], e1.vehicle.timestamp, 'after put(foo)')

store.put('bar', e2)
feedMsgEqual(store, [e1, e2], e1.vehicle.timestamp, 'after put(bar)')

store.put('baz', e3)
feedMsgEqual(store, [e1, e2, e3], e3.trip_update.timestamp, 'after put(baz)')

store.put('foo', e3)
feedMsgEqual(store, [e2, e3, e3], e3.trip_update.timestamp, 'after put(foo)')

store.del('bar')
feedMsgEqual(store, [e3, e3], e3.trip_update.timestamp, 'after del(bar)')

strictEqual(store.nrOfEntities(), 2, 'after del(bar): nrOfEntities()')

store.flush()
feedMsgEqual(store, [], timestamp(), 'after flush()') // todo: this is flaky



const full = gtfsRtDifferentialToFullDataset({ttl, timestamp})

let changeEmitted = false
full.once('change', () => {
	changeEmitted = true
})

pump(
	createReadStream(join(__dirname, 'data.ndjson'), {encoding: 'utf8'}),
	parse(),
	full,
	(err) => {
		if (err) {
			console.error(err)
			process.exit(1)
		}

		strictEqual(changeEmitted, true, 'no `change` event emitted')
		bufEqual(full.asFeedMessage(), Buffer.from(
			`\
0a090a03322e301000180112b6020a01321ab0020a250a15317c32353434\
357c327c38367c31323033323032301a0832303230303331322a026e3312\
1c12001a08080010b8b1abf305220c393030303030303530333031280012\
36121108c4ffffffffffffffff0110c0bfabf3051a1108c4ffffffffffff\
ffff0110c0bfabf305220c39303030303030323333353428001236121108\
c4ffffffffffffffff0110fcbfabf3051a1108c4ffffffffffffffff0110\
fcbfabf305220c39303030303030323332303328001236121108c4ffffff\
ffffffffff0110f4c0abf3051a1108c4ffffffffffffffff0110f4c0abf3\
05220c39303030303030323332303428001225121108c4ffffffffffffff\
ff0110b0c1abf3051a00220c39303030303030353631303128001a1a0a05\
34303831331211552057697474656e62657267706c61747a125c0a013322\
570a250a15317c36343436367c317c38367c31323033323032301a083230\
3230303331322a026e36120a0d66665042159a99514120013a0c39303030\
3030303132313036421212105520416c742d4d617269656e646f72661259\
0a013422540a260a15317c36343531327c317c38367c3132303332303230\
1a0832303230303331322a036e3138120a0d66665242156666564120023a\
0c393030303030303035323035420e120c55204d6f6872656e7374722e`,
			'hex'
		))
		strictEqual(full.timeModified(), timestamp(), 'invalid full.timeModified()')

		console.info('ok 1 works')
	}
)
