require('dotenv').config();

// Validate required environment variables at startup
const required = [
    'ZWIFT_USERNAME', 'ZWIFT_PASSWORD', 'ZWIFT_PLAYER_ID',
    'SPEED_LEVEL1', 'SPEED_LEVEL2', 'SPEED_LEVEL3',
    'HEARTRATE', 'POWER_LEVEL1', 'POWER_LEVEL2', 'POWER_LEVEL3'
];
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
    throw new Error('Missing required environment variables: ' + missing.join(', ') + '. See .env.example');
}

// Zwift credentials — set these in your .env file (see .env.example)
module.exports.username = process.env.ZWIFT_USERNAME;
module.exports.password = process.env.ZWIFT_PASSWORD;
// Zwift player id (find the playerId on your PC running the Zwift client. There is a folder named userXXXXXX. These
// numbers are the playerId.)
module.exports.playerId = process.env.ZWIFT_PLAYER_ID;

// Zwift simulation mode: speed thresholds (km/h) to switch fan levels
module.exports.speedLevel1 = Number(process.env.SPEED_LEVEL1);
module.exports.speedLevel2 = Number(process.env.SPEED_LEVEL2);
module.exports.speedLevel3 = Number(process.env.SPEED_LEVEL3);

// Zwift workout mode: fan is only switched on if above this heartrate
module.exports.heartrate = Number(process.env.HEARTRATE);
// Power thresholds (watts) to switch fan levels
module.exports.powerLevel1 = Number(process.env.POWER_LEVEL1);  // eg. 55% of FTP
module.exports.powerLevel2 = Number(process.env.POWER_LEVEL2);  // eg. 75% of FTP
module.exports.powerLevel3 = Number(process.env.POWER_LEVEL3);  // eg. 95% of FTP
