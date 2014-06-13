var express = require('express')

var bodyParser = require('body-parser')
// var favicon = require('serve-favicon')
var hbs        = require('express-hbs')

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
app.use(require('morgan')('dev'))
// app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(express.static(__dirname + '/public'))

app.get('/', function(req, res) {
  res.render('index')
})

var getMedia = require('./lib/media')
app.get('/search', function(req, res, next) {
  getMedia().then(function(items){
    res.send(items)
  }).catch(next)
})

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
    app.use(require('errorhandler')())
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  console.error(err)
  res.render('error', {
    message: err.message,
    error: {}
  });
});
/* jshint unused:true */

var server = app.listen(app.get('port'), function() {
  console.log('Express started on port %d', server.address().port)
})
