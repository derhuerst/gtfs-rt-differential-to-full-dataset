'use strict'

const {strictEqual} = require('assert')
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
	timestamp: timestamp(),
}

const feedMsgEqual = (store, entities) => {
	const actual = store.asFeedMessage()
	const expected = FeedMessage.encode({header, entity: entities})
	bufEqual(actual, expected)
}

const store = createEntitiesStore(ttl, timestamp)
store.put('foo', e1)
store.put('bar', e2)
feedMsgEqual(store, [e1, e2])

store.put('baz', e3)
feedMsgEqual(store, [e1, e2, e3])

store.put('foo', e3)
feedMsgEqual(store, [e2, e3, e3])

store.del('bar')
feedMsgEqual(store, [e3, e3])

store.flush()
feedMsgEqual(store, [])



const full = toFullDataset({ttl, timestamp})
pump(
	createReadStream(join(__dirname, 'data.ndjson'), {encoding: 'utf8'}),
	parse(),
	full,
	(err) => {
		if (err) {
			console.error(err)
			process.exit(1)
		}

		bufEqual(full.asFeedMessage(), Buffer.from(
			`\
0a090a03322e301001180112520a0132224d0a1b0a15317c36343436367c317c38367\
c31323033323032302a026e36421212105520416c742d4d617269656e646f7266120a\
0d66665042159a9951413a0c39303030303030313231303620011289020a01331a830\
20a1b0a15317c32353434357c327c38367c31323033323032302a026e331a1a0a0534\
303831331211552057697474656e62657267706c61747a121c220c393030303030303\
53033303112001a08080010b8b1abf3052800122c220c393030303030303233333534\
120c08c4ffffff0f10c0bfabf3051a0c08c4ffffff0f10c0bfabf3052800122c220c3\
93030303030303233323033120c08c4ffffff0f10fcbfabf3051a0c08c4ffffff0f10\
fcbfabf3052800122c220c393030303030303233323034120c08c4ffffff0f10f4c0a\
bf3051a0c08c4ffffff0f10f4c0abf30528001220220c393030303030303536313031\
120c08c4ffffff0f10b0c1abf3051a002800124f0a0134224a0a1c0a15317c3634353\
1327c317c38367c31323033323032302a036e3138420e120c55204d6f6872656e7374\
722e120a0d6666524215666656413a0c3930303030303030353230352002`,
			'hex'
		))
	}
)
