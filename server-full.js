// Minimal Simple REST API Handler (With MongoDB and Socket.io)
// Plus support for simple login and session
// Plus support for file upload
// Author: Yaron Biton misterBIT.co.il

"use strict";
const express = require('express'),
	bodyParser = require('body-parser'),
	cors = require('cors'),
	mongodb = require('mongodb'),
	moment = require('moment')

const clientSessions = require("client-sessions");
const multer = require('multer')

// Configure where uploaded files are going
const uploadFolder = '/uploads';
var storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, __dirname + uploadFolder);
	},
	filename: function (req, file, cb) {
		cl('file', file);
		const ext = file.originalname.substr(file.originalname.lastIndexOf('.'));
		cb(null, file.fieldname + '-' + Date.now() + ext)
	}
})
var upload = multer({ storage: storage })

const app = express();

var corsOptions = {
	origin: /http:\/\/localhost:\d+/,
	credentials: true
};

const serverRoot = 'http://localhost:3003/';
const baseUrl = serverRoot + 'data';


app.use(express.static('uploads'));
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(clientSessions({
	cookieName: 'session',
	secret: 'C0d1ng 1s fun 1f y0u kn0w h0w', // set this to a long random string!
	duration: 30 * 60 * 1000,
	activeDuration: 5 * 60 * 1000,
}));

const http = require('http').Server(app);
const io = require('socket.io')(http);


function dbConnect() {

	return new Promise((resolve, reject) => {
		// Connection URL
		// var url = 'mongodb://localhost:27017/local';
		var url = 'mongodb://orharpaz:123456@ds117209.mlab.com:17209/trackmyfood';

		// Use connect method to connect to the Server
		mongodb.MongoClient.connect(url, function (err, db) {
			if (err) {
				cl('Cannot connect to DB', err)
				reject(err);
			}
			else {
				//cl("Connected to DB");
				resolve(db);
			}
		});
	});
}

//GET stats
app.get('/data/stats', function (req, res) {
	dbConnect().then((db) => {
		const collection = db.collection('feeling');
		collection.find({userId: req.session.user._id}).toArray((err, feelings) => {
			if (err) {
				cl('Cannot get feelings list of ', err)
				res.json(404, { error: 'not found' })
			} else {
				//returning -4 h food timestamp 

				// let feelingTimestampsMinus4 = feelings.map(function (feeling) {
				// 	return moment(feeling.time).subtract(4, 'hours');

				// });
				// cl('feelingTimestampsMinus4', ...feelingTimestampsMinus4);
				const foodCollection = db.collection('food');
				foodCollection.find({userId: req.session.user._id}).toArray((err, foods) => {
					if (err) {
						cl('Cannot get food list ', err)
						res.json(404, { error: 'not found' })
					} else {
						cl('foods:', foods);
						let matchingFoods = foods.filter(function (food) {
							let matchingFeeling = feelings.find(function (feeling) {
								let feelingTimeStamp = moment(feeling.time);
								let foodTimestamp = moment(food.time);
								let diff = Math.abs(feelingTimeStamp.diff(foodTimestamp, 'minutes'));
								return diff > 60*4 && diff < 60*9;
							});
							if (matchingFeeling !== undefined) {
								return true;
							} else {
								return false;
							}
						});

						let resultFoods = matchingFoods.map(function (matchingFood) {
							let matchingFeeling = feelings.find(function (feeling) {
								let feelingTimeStamp = moment(feeling.time);
								let foodTimestamp = moment(matchingFood.time);
								let diff = Math.abs(feelingTimeStamp.diff(foodTimestamp, 'minutes'));
								return diff > 60*4 && diff < 60*9;
							});
							matchingFood.rating = matchingFeeling.rating;
							return matchingFood;
						});
						cl('matchingFoods', matchingFoods);
						cl('resultFoods',resultFoods)
						res.json(matchingFoods)
					}
				});
			}

			db.close();
		});
	});
});

// GETs a list
app.get('/data/:objType', function (req, res) {
	const objType = req.params.objType;

	console.log('Fetching for user: ', req.session.user);
	dbConnect().then((db) => {
		const collection = db.collection(objType);

		collection.find({userId: req.session.user._id}).toArray((err, objs) => {
			if (err) {
				cl('Cannot get you a list of ', err)
				res.json(404, { error: 'not found' })
			} else {
				cl("Returning list of " + objs.length + " " + objType + "s");
				res.json(objs);
			}
			db.close();
		});
	});
});

// GETs a single
app.get('/data/:objType/:id', function (req, res) {
	const objType = req.params.objType;
	const objId = req.params.id;
	cl(`Getting you an ${objType} with id: ${objId}`);
	dbConnect()
		.then((db) => {
			const collection = db.collection(objType);
			//let _id;
			//try {
			let _id = new mongodb.ObjectID(objId);
			//}
			//catch (e) {
			//	console.log('ERROR', e);
			//	return Promise.reject(e);
			//}

			collection.find({ _id: _id }).toArray((err, objs) => {
				if (err) {
					cl('Cannot get you that ', err)
					res.json(404, { error: 'not found' })
				} else {
					cl("Returning a single " + objType);
					res.json(objs[0]);
				}
				db.close();
			});
		});
});

// DELETE
app.delete('/data/:objType/:id', function (req, res) {
	const objType = req.params.objType;
	const objId = req.params.id;
	cl(`Requested to DELETE the ${objType} with id: ${objId}`);
	dbConnect().then((db) => {
		const collection = db.collection(objType);
		collection.deleteOne({ _id: new mongodb.ObjectID(objId) }, (err, result) => {
			if (err) {
				cl('Cannot Delete', err)
				res.json(500, { error: 'Delete failed' })
			} else {
				cl("Deleted", result);
				res.json({});
			}
			db.close();
		});

	});


});

// POST - adds 
app.post('/data/:objType', upload.single('file'), function (req, res) {
	//console.log('req.file', req.file);
	// console.log('req.body', req.body);

	const objType = req.params.objType;
	cl("POST for " + objType);

	const obj = req.body;
	delete obj._id;
	// If there is a file upload, add the url to the obj
	if (req.file) {
		obj.imgUrl = serverRoot + req.file.filename;
	}

	dbConnect().then((db) => {
		const collection = db.collection(objType);

		collection.insert(obj, (err, result) => {
			if (err) {
				cl(`Couldnt insert a new ${objType}`, err)
				res.json(500, { error: 'Failed to add' })
			} else {
				cl(objType + " added");
				res.json(obj);
				db.close();
			}
		});
	});

});

// PUT - updates
app.put('/data/:objType/:id', function (req, res) {
	const objType = req.params.objType;
	const objId = req.params.id;
	const newObj = req.body;
	if (newObj._id && typeof newObj._id === 'string') newObj._id = new mongodb.ObjectID(newObj._id);

	cl(`Requested to UPDATE the ${objType} with id: ${objId}`);
	dbConnect().then((db) => {
		const collection = db.collection(objType);
		collection.updateOne({ _id: new mongodb.ObjectID(objId) }, newObj,
			(err, result) => {
				if (err) {
					cl('Cannot Update', err)
					res.json(500, { error: 'Update failed' })
				} else {
					res.json(newObj);
				}
				db.close();
			});
	});
});

// Basic Login/Logout/Protected assets
app.post('/login', function (req, res) {
	dbConnect().then((db) => {
		db.collection('user').findOne({ username: req.body.username, pass: req.body.pass }, function (err, user) {
			if (user) {
				cl('Login Succesful');
				delete user.pass;
				req.session.user = user;  //refresh the session value
				res.json({ token: 'Beareloginr: puk115th@b@5t', user });
			} else {
				cl('Login NOT Succesful');
				req.session.user = null;
				res.json(403, { error: 'Login failed' })
			}
		});
	});
});



app.get('/logout', function (req, res) {
	req.session.reset();
	res.end('Loggedout');
});

function requireLogin(req, res, next) {
	if (!req.session.user) {
		cl('Login Required');
		res.json(403, { error: 'Please Login' })
	} else {
		next();
	}
};
app.get('/protected', requireLogin, function (req, res) {
	res.end('User is loggedin, return some data');
});


// Kickup our server 
// Note: app.listen will not work with cors and the socket
// app.listen(3003, function () {
http.listen(3003, function () {
	console.log(`misterREST server is ready at ${baseUrl}`);
	console.log(`GET (list): \t\t ${baseUrl}/{entity}`);
	console.log(`GET (single): \t\t ${baseUrl}/{entity}/{id}`);
	console.log(`DELETE: \t\t ${baseUrl}/{entity}/{id}`);
	console.log(`PUT (update): \t\t ${baseUrl}/{entity}/{id}`);
	console.log(`POST (add): \t\t ${baseUrl}/{entity}`);

});


io.on('connection', function (socket) {
	console.log('a user connected');
	socket.on('disconnect', function () {
		console.log('user disconnected');
	});
	socket.on('chat message', function (msg) {
		// console.log('message: ' + msg);
		io.emit('chat message', msg);
	});
});

cl('WebSocket is Ready');

// Some small time utility functions
function cl(...params) {
	console.log.apply(console, params);
}

// Just for basic testing the socket
app.get('/', function (req, res) {
	res.sendFile(__dirname + '/test-socket.html');
});