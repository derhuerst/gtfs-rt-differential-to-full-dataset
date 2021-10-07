'use strict'

const {strictEqual, ok} = require('assert')
const {FeedHeader, FeedMessage} = require('gtfs-rt-bindings')
const pump = require('pump')
const {createReadStream} = require('fs')
const {join} = require('path')
const {parse} = require('ndjson')
const createEntitiesStore = require('../lib/entities-store')
const toFullDataset = require('..')
const {encodeField} = createEntitiesStore

const bufEqual = (actual, expected, msg = undefined) => {
	strictEqual(actual.toString('hex'), expected.toString('hex'), msg)
}

bufEqual(encodeField(1, 2, 123456), Buffer.from([10, 192, 196, 7]))

console.info('1..1')

const ttl = 5 * 60 * 1000 // 5 minutes
const timestamp = () => 1

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
	trip_update: {
		trip: {trip_id: '1|33296|7|86|12032020', route_id: 'u3'},
		vehicle: {id: null, label: 'U Gleisdreieck'},
		stop_time_update: [
			{stop_id: '900000041101', departure: {delay: 60}},
		],
	}
}

const header = {
	gtfs_realtime_version: '2.0',
	incrementality: FeedHeader.Incrementality.FULL_DATASET,
	timestamp: timestamp(),
}

const feedMsgEqual = (store, entities, testName) => {
	const actual = store.asFeedMessage()
	const expected = FeedMessage.encode({header, entity: entities}).finish()
	bufEqual(actual, expected, testName + ': encoded feed should be equal')
}

const store = createEntitiesStore(ttl, timestamp)
feedMsgEqual(store, [], 'init')

store.put('foo', e1)
feedMsgEqual(store, [e1], 'after put(foo)')

store.put('bar', e2)
feedMsgEqual(store, [e1, e2], 'after put(bar)')

store.put('baz', e3)
feedMsgEqual(store, [e1, e2, e3], 'after put(baz)')

store.put('foo', e3)
feedMsgEqual(store, [e2, e3, e3], 'after put(foo)')

store.del('bar')
feedMsgEqual(store, [e3, e3], 'after del(bar)')

store.flush()
feedMsgEqual(store, [], 'after flush()')



const full = toFullDataset({ttl, timestamp})

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
0a090a03322e301000180112520a0132224d0a1b0a15317c36343436367c317c38367\
c31323033323032302a026e36120a0d66665042159a99514120013a0c393030303030\
303132313036421212105520416c742d4d617269656e646f726612ac020a01331aa60\
20a1b0a15317c32353434357c327c38367c31323033323032302a026e33121c12001a\
08080010b8b1abf305220c39303030303030353033303128001236121108c4fffffff\
fffffffff0110c0bfabf3051a1108c4ffffffffffffffff0110c0bfabf305220c3930\
3030303030323333353428001236121108c4ffffffffffffffff0110fcbfabf3051a1\
108c4ffffffffffffffff0110fcbfabf305220c393030303030303233323033280012\
36121108c4ffffffffffffffff0110f4c0abf3051a1108c4ffffffffffffffff0110f\
4c0abf305220c39303030303030323332303428001225121108c4ffffffffffffffff\
0110b0c1abf3051a00220c39303030303030353631303128001a1a0a0534303831331\
211552057697474656e62657267706c61747a124f0a0134224a0a1c0a15317c363435\
31327c317c38367c31323033323032302a036e3138120a0d666652421566665641200\
23a0c393030303030303035323035420e120c55204d6f6872656e7374722e122c0a01\
3522270a070a0274312a0141120a0da4709d3f158fc2154042100a066275732d31321\
206427573203132`,
			'hex'
		))
		ok(Number.isInteger(full.timeModified()), 'invalid full.timeModified()')

		console.info('ok 1 works')
	}
)
