'use strict';

/**
 * Load environment configuration
 */
module.exports = {
    ...require('./env/all.js'),
    ...require('./env/' + process.env.NODE_ENV + '.js') || {},
}
