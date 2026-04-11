const axios = require('axios');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const filesToDownload = [
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/africa.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/asia-austronesia.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/asia-south-china.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/asia-south-india.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/asia-south.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/europe-east.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/europe-germany.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/europe-northwest.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/europe-south.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/europe-southeast.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/europe-southwest.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/north-america-east.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/north-america-west.osm.pbf',
  'https://download3.bbbike.org/osm/planet/sub-planet-daily/south-america.osm.pbf'
];

async function processStream(url) {
  const filename = path.basename(url);
  const outputName = filename.replace('.pbf', '-phones.osm');
  
  console.log(`Processing ${filename} via stream...`);

  return new Promise(async (resolve, reject) => {
    try {
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream'
      });

      // Spawn osmium. The "-" tells osmium to read from stdin.
      // We specify the input format as pbf because stdin doesn't have a file extension.
      const osmium = spawn('osmium', [
        'tags-filter', 
        '-F', 'pbf', '-', 
        'phone', 
        '-o', outputName, 
        '--overwrite'
      ]);

      // Pipe download to osmium's input
      response.data.pipe(osmium.stdin);

      osmium.stderr.on('data', (data) => {
        console.error(`Osmium Log: ${data}`);
      });

      osmium.on('close', (code) => {
        if (code === 0) {
          console.log(`Finished: ${outputName}`);
          resolve();
        } else {
          reject(new Error(`Osmium exited with code ${code}`));
        }
      });

      response.data.on('error', (err) => reject(err));
      osmium.on('error', (err) => reject(err));

    } catch (err) {
      reject(err);
    }
  });
}

async function run() {
  for (const url of filesToDownload) {
    try {
      await processStream(url);
    } catch (err) {
      console.error(`Error processing ${url}:`, err.message);
      // Continue to next file even if one fails
    }
  }
}

run();