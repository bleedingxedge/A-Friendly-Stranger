var express = require('express')

var async      = require('async')
var bodyParser = require('body-parser')
// var favicon = require('serve-favicon')
var hbs        = require('express-hbs')
var instagram  = require('instagram-node').instagram()
var Twit       = require('twit')


var searchTerm = 'nofilter'

var app = express()
app.engine('hbs', hbs.express3({
  partialsDir: __dirname + '/views/partials',
  defaultLayout: __dirname + '/views/layout/default.hbs'
}))
app.set('view engine', 'hbs')
app.set('views', __dirname + '/views')
app.set('port', process.env.PORT || 3000)
app.use(bodyParser.json())
app.use(bodyParser.urlencoded())
// app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(express.static(__dirname + '/public'))

app.route('/')
.get(function(req, res) {
  res.render('index')
})

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

app.route('/search')
.get(function(req, res) {
  async.parallel({
    twitter: function(next) {
      twitterClient.get('search/tweets', {q: '#' + searchTerm}, next)
    },
    instagram: function(next) {
      instagram.tag_media_recent(searchTerm, next)
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

/// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

/// error handlers

/*jshint unused:false */
// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});
/* jshint unused:true */

var server = app.listen(app.get('port'), function() {
  console.log('Express started on port %d', server.address().port)
})