var express   = require('express')
var async     = require('async')
var instagram = require('instagram-node').instagram()
var Twit      = require('twit')
var config    = require('../config')

var router = express.Router()

/*jshint camelcase:false */
var twitterClient = new Twit({
  consumer_key: 'rZMGvmwPdkfTiR6Aqjy8RvSo7',
  consumer_secret: '2nH3BI7HIUxjkNJW8elrBfyB3lyT4kyLEuKFxe90T0CdhQWwMl',
  access_token: '3367771-I8ccGU4UUTaH5OUV6Q3YlkQoC0Hk7VWMH7Z6CwbUQf',
  access_token_secret: 'Yj85eg4fuL4aDV8l6cJrYZ0l2iFvAJKw4JQ5gFe2AxiUf',
})

instagram.use({
  client_id: '885de22d7010427681562ab71cd81127',
  client_secret: '0a88e2d362fb4b23b1d5c6c4d93a8a34'
})

router.get('/', function(req, res) {
  async.parallel({
    twitter: function(next) {
      twitterClient.get('search/tweets', {q: '#' + config.searchTerm}, next)
    },
    instagram: function(next) {
      instagram.tag_media_recent(config.searchTerm, next)
    }

  }, function(err, results) {
    if (err) {
      return res.send(500, err.message)
    }

    var twitterData = results.twitter[0].statuses
    var instagramData = results.instagram[0]

    var statusLength = (twitterData.length || 0) + (instagramData.length || 0)
    res.send({
      twitter: twitterData,
      instagram: instagramData,
      length: statusLength
    })
  })
})
/*jshint camelcase:true */

module.exports = router