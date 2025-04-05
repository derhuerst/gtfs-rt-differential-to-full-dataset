'use strict'

const { pipeline } = require('stream')
const ndjson = require('ndjson')
const {join} = require('path')
const fs = require('fs')
const net = require('net');
const {gtfsRtDifferentialToFullDataset} = require('.')

const toFullDataset = gtfsRtDifferentialToFullDataset({
	ttl: 1 * 60 * 60 * 1000, // 1 hour
	requireDifferentialInput: false,
})

const writeFull = () => {
	fs.writeFile('/gtfsrt/latest.gtfs-rt.pbf.temp', toFullDataset.asFeedMessage(), err => {
		if (err) {
			console.error(err);
		} else {
			// mv to emulate atomic write to avoid garbled reads for consumers of /gtfsrt/latest.gtfs-rt.pbf
			fs.rename('/gtfsrt/latest.gtfs-rt.pbf.temp', '/gtfsrt/latest.gtfs-rt.pbf', function (err) {
				if (err) console.log(err);
				console.log('written', toFullDataset.timeModified(), toFullDataset.nrOfEntities());
			});
		}
	});
}

toFullDataset.on('change', () => {
	// write full feed on every update
	writeFull();
})

// Creating a named pipe that differential updates can be read from: `mkfifo ndjsonpipe`
// You can then send updates with sth like `cat differential.gtfs-rt.pbf | npx print-gtfs-rt-cli -j -a > ndjsonpipe`
fs.open(join(__dirname, 'ndjsonpipe'), fs.constants.O_RDWR | fs.constants.O_NONBLOCK, (err, fd) => {
	pipeline(
		new net.Socket({ fd }),		
		ndjson.parse(),
		toFullDataset,
		(err) => {
			if (err) {
				console.log(err)
				//process.exit(1)
			} else {
				console.log('terminated');
				writeFull();
			}
		}
	)
});