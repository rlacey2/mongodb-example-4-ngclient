 
var host_uri = "localhost"; // 

var express = require('express');
var fs = require('fs');  // for certs
var os = require('os');
var https = require('https'); 
var http  = require('http');  
var compression = require('compression');
var toobusy = require('toobusy-js'); 
var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;          // NB
var bodyParser = require('body-parser'); 
// you can research all the commented out features and 'npm install --save' as required
var helmet = require('helmet'); // Helmet helps you secure your Express apps by setting various HTTP headers. It's not a silver bullet, but it can help!
var path = require('path');
var morgan = require('morgan');

 
// developer code
var platform = require('./node_server/platform.js').configure();
var secrets  = require('./secrets.js');  

//console.log(secrets.mongodb.connectionStr());
 
var myCollection;

var myCollections = {};
var connectURL;

// HARD CODED THE CHOICE OF DATABASE SWITCH THE NEXT TWO LINES, comment/uncomment if you have local mongodb installed
 connectURL = secrets.mongodb.connectionStr(); // cloud // these two lines can be improved how?
//connectURL = secrets.mongodb.connectionStrLocalhost();
 
console.log("Have you configured the mongoDB connection correctly?");
console.log("Connecting to: " + connectURL);


MongoClient.connect(connectURL)
		.then(client => {
				console.log("connected to the mongoDB using ^3.0.4");
				myCollections.students = client.db('testing01').collection('students');
				myCollections.courses = client.db('testing01').collection('courses');
 
		})
		.catch( error => {		 
				console.log(error);				 
			})
 
 
var connectionListener = false;

var app = express();

 
app.use(morgan("dev", {}));
//app.use(logger('dev'));  // log every request to the console   morgan 	
app.use(compression()); // must be first, GZIP all assets https://www.sitepoint.com/5-easy-performance-tweaks-node-js-express/
app.use(bodyParser.urlencoded({'extended':'true'}));            // parse application/x-www-form-urlencoded
app.use(bodyParser.json());                                     // parse application/json
app.use(bodyParser.json({ type: 'application/vnd.api+json' })); // parse application/vnd.api+json as json
app.use(helmet()); // by default - removes:  ; adds: X-Frame-Options:SAMEORIGIN
 
app.use(function(req, res, next) {  // HAS TO BE FIRST   middleware which blocks requests when we're too busy 
  if (toobusy()) {
     res.status(503).send("<p><p>&nbsp&nbsp<h1>The server is busy, please try later, possibly in about 30 seconds.</h1>");
  } else {
    next();
  }
});

console.log(platform);
	

if (platform.isLocalHost) { //was cfCore.isLocal
// openssl genrsa -out test-key.pem 1024 
// openssl req -new -key test-key.pem -out certrequest.csr
// openssl x509 -req -in certrequest.csr -signkey test-key.pem -out test-cert.pem	
	console.log("*** Using temp SSL keys on the nodejs server");
	var privateKey   = fs.readFileSync('ssl/test-key.pem');
	var certificate  = fs.readFileSync('ssl/test-cert.pem'); 

    var localCertOptions = {  // use local self-signed cert
        key: privateKey, 
        cert: certificate, 
        requestCert: false, 
        rejectUnauthorized: false 
    }; 		
		
    https.createServer (localCertOptions, app).listen (platform.port, function () { 
	   console.log(new Date().toISOString());
	   console.log(__dirname + '/_ngClient');
    }); 
 	
} else { // not local, its in the cloud somewhere, assuming cloud provides ssl certs

    if (platform.architecture === "bluemix") // could refactor next 2, leaving separate incase needed in future
	{
		app.listen(platform.port, function() {
		    console.log (platform.architecture + ' server startup port: ' + platform.port); 
		}); 
	}
	else 
		if (platform.architecture === "heroku")
	{ 
		app.listen(platform.port, function() {
		    console.log (platform.architecture + ' server startup port: ' + platform.port); 
		}); 			
	}		
}    
app.enable('trust proxy');
 
app.use (function (req, res, next) {  // req.protocol
        if (req.secure) {
                next(); // request was via https, so do no special handling
        } else {
                // request was via unsecure http, so redirect to https
				console.log("redirecting from http to https");
                res.redirect('https://' + req.headers.host + req.url);
        }
});

app.use( // public client pages  THIS FINDS _ngClient/index.html
			"/", //the URL throught which you want to access   static content
			express.static(__dirname + '/_ngClient')  //where your static content is located in your filesystem
				); 
app.use( // alias to third party js code etc
			"/js_thirdparty", //the URL throught which you want to access   content
			express.static(__dirname + '/js_thirdparty')  
				); 				
 

app.all('/*', function(req, res, next) {
    // CORS headers,     the * means any client can consume the service???
    res.header("Access-Control-Allow-Origin", "*"); // restrict it to the required domain
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    // Set custom headers for CORS;
    res.header('Access-Control-Allow-Headers', 'Content-type,Accept,X-Access-Token');
    if (req.method == 'OPTIONS') {
        res.status(200).end();
    } else {
        next(); 
    }
});  
 
// middleware is performed before hitting the route handler proper (must pass middleware logic) 
// causes two authenications app.all('/api/v1/admin/*', [require('./middlewares/validateRequest').validateRequest]);
//app.all('/api/v1/*', [require('./routes/middlewares/validateRequest').validateRequest]);

function findStudents(findOptions, cb) {  // promise returned
        return myCollections.students.find(findOptions).toArray(cb);
    }
 
function getStudents(req, res, findOptions, cb) { // promises
	
	findStudents( findOptions)
		  .then( results => {
			res.status(200);
			res.json(results);		 
		  })
		  .catch ( err => {
			console.log("error:");
			console.log(err.message);
			res.status(404);
			res.json({"error": err.message});
		  });	
    } 

app.delete('/api/v1/student/:_id', function(req, res) {   // promises
    console.log('DELETE /api/v1/student');
	console.log(req.params._id);
	myCollections.students.deleteOne({  _id  :  ObjectID(req.params._id)})
		  .then( result => {
			   console.log("student entry deleted");
			   res.status(200);
			   console.log(JSON.stringify(result))
			   res.json(result);
		  })
		  .catch ( err => {
				console.log("error:");
				console.log(err.message);
				res.status(404);
				res.json({"error": err.message});	
		  });	 
 
});
	
app.put('/api/v1/student', function(req, res) {   // promises - one single student
    console.log('PUT /api/v1/student');
	console.log(req.body);
	
	findStudents({})
		  .then( results => {
			console.log("total students so far: " + results.length);	 
			if (results.length < 119)
				{
					// add one student
 
					 myCollections.students.insert(req.body);   // chaining issue so nestto the next then	 
				}
			else
			{
				throw new Error("too many students, single insert denied");
			//	res.status(404);
			//	return res.json({"msg": "too many students, single insert denied"});	
			}
		  })
		  .then( result => {   //
					   console.log("student entry saved via put");
					   res.status(200);
					   return res.json({"msg": "new student saved"});
		  })
		  .catch ( err => {
			console.log("catch error:");
			console.log(err.message);
			 		
			res.status(404);
			 
			return res.json({msg :err.message });
		  });		
	});	
 
app.post('/api/v1/student', function(req, res) {   // promises - update a student THIS SHOULD BE PUT, swap
    console.log('POST /api/v1/student');
	console.log(req.body);	
	var _id = req.body._id;
	delete req.body._id;  // NB, its put back as part of the update, in the sense that it is not touched
	
	myCollections.students.update({"_id" : ObjectID(_id)},req.body)
		  .then( result => {
			   console.log("student entry saved");
			   res.status(200);
			   res.json(result);	 
		  })
		  .catch ( err => {
				console.log("error:");
				console.log(err.message);
				res.status(404);
				res.json({"error": err.message});	
		  });		
 
});
	
app.get('/api/v1/students', function(req, res) { // promises - allows a browser url call 
    console.log('GET /api/v1/students');
	 
	var findOptions = {};
	
	getStudents(req,res,findOptions);
});

app.post('/api/v1/students', function(req, res) { // pomises - need the post method to pass filters in the body  
    console.log('POST /api/v1/students');
	 
	var findOptions = {};
	
	// these checks could be normalised to a function
	if (req.body.course) 
	{
		findOptions.course = {$eq : req.body.course};
	}
	if (req.body.year) 
	{
		findOptions.year = {$eq : parseInt( req.body.year )};
	}	
	console.log(findOptions)
	getStudents(req,res,findOptions);
});

app.post('/api/v1/loadstudents', function(req, res) { // promise - API restful semantic issues i.e. loadstudents
    console.log('POST /api/v1/loadstudents');	 
	
	// only insert if max < 100
	
	var records = [
		{ "name" : "bloggs, joseph", "course" : "applied", "year" : 1 },
		{ "name" : "bloggs, thomas", "course" : "ssd", "year" : 2 },
		{ "name" : "smith, joe",  "course" : "forensics", "year" : 3 },
		{ "name" : "walsh, ben",  "course" : "ssd", "year" : 4 },
		{ "name" : "murphy, alan",  "course" : "ssd", "year" : 4 },
		{ "name" : "doyle, tom",  "course" : "forensics", "year" : 4 },
		{ "name" : "fitzpatrick, joe",  "course" : "applied", "year" : 3 },
		{ "name" : "furlong, joe",  "course" : "ssd", "year" : 3 },
		{ "name" : "murphy, edel",  "course" : "ssd", "year" : 3 },
		{ "name" : "sunderland, william",  "course" : "applied", "year" : 4 },
		{ "name" : "meagher, kevin",  "course" : "ssd", "year" : 3 },
		{ "name" : "walsh, aoife",  "course" : "ssd", "year" : 1 },
		{ "name" : "dunne, niamh",  "course" : "ssd", "year" : 4 },
		{ "name" : "connors, tom",  "course" : "forensics", "year" : 1 },
		{ "name" : "walsh, bob",  "course" : "forensics", "year" : 2 },
		{ "name" : "smith, ann",  "course" : "ssd", "year" : 3 },
		{ "name" : "fitzpatrick, alan",  "course" : "applied", "year" : 4 },
		{ "name" : "murphy, mary",  "course" : "ssd", "year" : 4 },
		{ "name" : "jones, pat",  "course" : "ssd", "year" : 3 },
		{ "name" : "o grady, pat",  "course" : "ssd", "year" : 3 }	 ];
	 
	var errorFlag = false;  // can use for feedback
	var insertCount = 0;
 
	findStudents({}) // find the total number of existing students, DOES NOT SCALE WELL, STORE COUNT IN DB
		  .then( results => {
			  
					console.log("total students so far: " + results.length);
					if (results.length < 100)
					{
						myCollections.students.insertMany(records)
								  .then( result => {
									//	console.log(result)
										res.status(200);
										return res.json(result);	
								  })
								  .catch ( err => {
									console.log(err);
									res.status(404);
									return res.json({});
								  });							  
					}
					else 
					{
						console.log("too many students if this load went ahead");
						res.status(404);
						return res.json({"msg": "too many students if this load went ahead"});	
					}
		  })
		  .catch ( err => {
			console.log("error:");
			console.log(err.message);
			res.status(404);
			return res.json({"error": err.message});
		  });		
});

app.delete('/api/v1/deletestudents', function(req, res) {  
    console.log('DELETE /api/v1/loadstudents');
	var errorFlag = false;  // can use for feedback
	 
		myCollections.students.deleteMany({})
		  .then( result => {
				var resJSON = JSON.stringify(result);
				console.log(resJSON);
				console.log(result.result.n);
				res.status(200);
				res.json(resJSON);	
		  })
		  .catch ( err => {
			console.log(err);
			res.status(404);
			res.json({});
		  });	    	
});

// if all the server rest type route paths are mapped in index.js
// app.use('/', require('./routes')); // will load/use index.js by default from this folder

// If no route is matched by now, it must be a 404
app.use(function(req, res, next) {
	console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%");
    var err = new Error('Route Not Found, are you using the correct http verb / is it defined?');
    err.status = 404;		 
    next(err);
});
  