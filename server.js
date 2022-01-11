const path = require('path');
const fs = require('fs');
const express = require('express');
const ws = require('ws');
const Database = require('./Database');
const SessionManager = require('./SessionManager');
const crypto = require('crypto');

function logRequest(req, res, next){
	console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
	next();
}

function isCorrectPassword(password, saltedHash) {
	var salt = saltedHash.substring(0, 20);
	var base64 = saltedHash.substring(20);
	var hash = crypto.createHash('sha256').update(password + salt).digest('base64');
	return (base64 === hash);
}

//get sanitize function referenced from 'https://stackoverflow.com/questions/2794137/sanitizing-user-input-before-adding-it-to-the-dom-in-javascript/48226843#48226843'
function sanitize(string) {
	const map = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		// '"': '&quot;',
		// "'": '&#x27;',
		// "/": '&#x2F;',
	};
	const reg = /[&<>]/ig;
	return string.replace(reg, (match)=>(map[match]));
}


const host = 'localhost';
const port = 3000;
const clientApp = path.join(__dirname, 'client');
const db = new Database('mongodb://localhost:27017', 'cpen322-messenger');
var messageBlockSize = 10;
const sessionManager = new SessionManager();

// express app
let app = express();

app.use(express.json()) 						// to parse application/json
app.use(express.urlencoded({ extended: true })) // to parse application/x-www-form-urlencoded
app.use(logRequest);							// logging for debug
app.use('/+', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.use('/profile', sessionManager.middleware, express.static(clientApp + '/profile.html'));
app.use('/app.js', sessionManager.middleware, express.static(clientApp + '/app.js'));
app.use('/index.html', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.use('/index', sessionManager.middleware, express.static(clientApp + '/index.html'));

// serve static files (client-side)
app.use('/', express.static(clientApp, { extensions: ['html'] }));
app.listen(port, () => {
	console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
});

// var chatrooms = [
	// {id: "room0", name: "Everyone in CPEN400A", image: "assets/everyone-icon.png"},
	// {id: "room1", name: "Foodies only", image: "assets/bibimbap.png"},
	// {id: "room2", name: "Gamers unite", image: "assets/minecraft.png"},
	// {id: "room3", name: "Canucks Fans", image: "assets/canucks.png"}
// ];

var messages = {
	// "room0": [],
	// "room1": [],
	// "room2": [],
	// "room3": []
};

db.getRooms().then((chatrooms) => {
	chatrooms.forEach((chatroom) => {
		messages[chatroom._id.toString()] = [];
	});
})

app.route('/chat')
	.get(sessionManager.middleware, function(req, res, next){
		// var serverRoom = chatrooms.map(room => Object.assign({
		// 	messages: messages[room._id]
		// }, room));
		// res.status(200).send(JSON.stringify(serverRoom));
		// res.end();
		db.getRooms().then((chatrooms) => {
			var serverRoom = chatrooms.map(room => Object.assign({
				messages: messages[room._id]
			}, room));
			res.status(200).send(JSON.stringify(serverRoom));
			res.end();
		})

	})
	.post(sessionManager.middleware, function(req, res, next) {
		if(!req.body.name)
			res.status(400).send(JSON.stringify(new Error("Error: no name field.")));
		else {
			var new_id = (new Date()).getTime().toString();
			var room = {
				_id: new_id,
				name: req.body.name,
				image: req.body.image
			}
			messages[room._id] = [];
			db.addRoom(room);
			console.log('82 ' + Object.keys(messages).length);
			res.status(200).send(JSON.stringify(room));
		}

		res.end();
	});


app.route('/chat/:room_id')
	.get(sessionManager.middleware, function(req, res, next){
		db.getRoom(req.params['room_id']).then(room => {
			if (room){
				res.status(200).send(room);
			} else{
				res.status(404).send('Room ' + req.params['room_id'] + ' was not found.');
			}
		})
	});

app.route('/chat/:room_id/messages')
	.get(sessionManager.middleware, function(req, res, next){
		db.getLastConversation(req.params['room_id'], req.query.before).then((conversation) => {
			if (conversation){
				res.status(200).send(conversation);
			}else {
				res.status(404).send('Conversation ' + req.params['room_id'] + ' was not found.');
			}
		})
	});

app.route('/profile')
	.get(sessionManager.middleware, function(req, res, next){
		var object = {
			username: req.username
		}
		res.status(200).send(JSON.stringify(object));
	})

app.route('/login')
	.post(function(req, res, next){
		db.getUser(req.body.username).then((result) => {
			if (result){
				if (isCorrectPassword(req.body.password, result.password)){
					sessionManager.createSession(res, req.body.username);
					res.redirect('/');
				}else {
					res.redirect('/login');
				}
			}else{
				res.redirect('/login');
			}
		})
	})

app.route('/logout')
	.get( function(req, res, next){
		sessionManager.deleteSession(req);
		res.redirect('/login');
})

app.use(function (err, req, res, next) {
	if(err instanceof SessionManager.Error) {
		if(req.headers.accept === 'application/json'){
			res.status(401).send(err);
		} else {
			res.redirect('/login');
		}
	} else {
		res.status(500).send("Not a SessionError object.");
	}
})

var broker = new ws.Server({port: 8000});
broker.on("connection", function(ws, req){
	var cookies = req.headers.cookie;
	console.log(cookies);
	if (cookies) {
		var cookie = cookies.split(';').filter(str => {
			return str.includes('cpen322-session');
		})
		if (cookie && cookie.length >= 1) {
			cookie = cookie[0].trim().substring(16);
			console.log(cookie);
			var username = sessionManager.getUsername(cookie);
			console.log(username);
			if (username) {
				ws.on("message", function (m) {
					var data = JSON.parse(m);
					// console.log(data);
					var roomId = data.roomId;
					data.username = sanitize(sessionManager.getUsername(cookie));
					data.text = sanitize(data.text);
					var message = {
						username: data.username,
						text: data.text
					}
					console.log(message['username']);
					broker.clients.forEach(function (client) {
						if (client !== ws) {
							client.send(JSON.stringify(data));
						}
					})
					if (messages[roomId]) {
						messages[roomId][messages[roomId].length] = message;
					} else {
						messages[roomId] = [];
						messages[roomId][messages[roomId].length] = message;
					}
					if (messages[roomId].length === messageBlockSize) {
						var Conversation = {
							room_id: roomId,
							timestamp: Date.now(),
							messages: messages[roomId]
						};
						db.addConversation(Conversation);
						messages[roomId] = [];
					}
				})
			} else {
				ws.close();
			}
		} else {
			ws.close();
		}
	}else {
		ws.close();
	}

})

// at the very end of server.js
cpen322.connect('http://99.79.42.146/cpen322/test-a5-server.js');
cpen322.export(__filename, { app,db,messageBlockSize, messages, broker, sessionManager, isCorrectPassword});