// Removes the contents of the given DOM element (equivalent to elem.innerHTML = '' but faster)
function emptyDOM (elem){
    while (elem.firstChild) elem.removeChild(elem.firstChild);
}

// Creates a DOM element from the given HTML string
function createDOM (htmlString){
    let template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

function* makeConversationLoader(room){
    var lastFetched = room.timestamp;
    var dialog;
    while (lastFetched > 0 && room.canLoadConversation){
        room.canLoadConversation = false;
        Service.getLastConversation(room.id, lastFetched).then(result => {
            if (result) {
                lastFetched = result.timestamp;
                room.canLoadConversation = true;
                room.addConversation(result);
                dialog = result;
            }
        });
        yield(dialog);
    }
}

function sanitize(string) {
    // const map = {
    //     '&': '&amp;',
    //     '<': '&lt;',
    //     '>': '&gt;',
    //     // '"': '&quot;',
    //     // "'": '&#x27;',
    //     // "/": '&#x2F;',
    // };
    // const reg = /[&<>"'/]/ig;
    // return string.replace(reg, (match)=>(map[match]));
    return string;
}

var profile = {
    username: "Clara",
};

class LobbyView {
    constructor(lobby){
        var that = this;
        this.lobby = lobby;
        this.elem = createDOM(
            `<div class = content>
                <ul class = room-list>
                </ul>
                <div class = page-control>
                    <input type = "text" placeholder = "Room Title">
                    <button>Create Room</button>
                </div>
            </div>`
        );
        this.listElem = this.elem.querySelector("ul.room-list");
        this.inputElem = this.elem.querySelector("input");
        this.buttonElem = this.elem.querySelector("button");
        this.redrawList();
        this.buttonElem.addEventListener("click", function(){
            Service.addRoom({
                _id: that.lobby.count.toString(),
                name: that.inputElem.value,
                image: "assets/chat-icon.png"
            }).then(
                (result) => {
                    that.lobby.addRoom(result._id, result.text, result.image, result.messages);
                    that.inputElem.value = '';
                    that.lobby.count ++;
                },
                (error) => {
                    console.log(error);
                }
            )
            // var text = that.inputElem.value;
            // var id = that.lobby.count;

        }, false);
        this.lobby.onNewRoom = function(room){
            var li = document.createElement('li');
            var a = document.createElement('a');
            that.listElem.scrollTop = that.listElem.scrollHeight;
            a.setAttribute('href', '/#/chat/' + room.id);
            a.innerText = room.name;
            li.appendChild(a);
            that.listElem.appendChild(li);
        }
    }
    redrawList(){
        emptyDOM(this.listElem);
        var id;
        for (id in this.lobby.rooms) {
            var cur_room = this.lobby.rooms[id];
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.setAttribute('href', '/#/chat/' + cur_room.id);
            a.innerText = cur_room.name;
            li.appendChild(a);
            this.listElem.appendChild(li);
        }
    }

}

class ChatView {
    constructor(socket){
        var that = this;
        this.room = null;
        this.elem = createDOM(
            `<div class = content>
                        <h4 class = room-name>Everyone in CPEN400A</h4>
                        <div class = message-list>
                        </div>
                        <div class = page-control>
                            <textarea></textarea>
                            <button>Send</button>
                        </div>
                </div>`
        );
        this.titleElem = this.elem.querySelector("h4");
        this.chatElem = this.elem.querySelector("div.message-list");
        this.inputElem = this.elem.querySelector("textarea");
        this.buttonElem = this.elem.querySelector("button");
        this.socket = socket;
        this.chatElem.style.minHeight = "50%";
        this.chatElem.style.maxHeight = "100%";
        this.chatElem.style.overflow = 'scroll';
        this.buttonElem.addEventListener("click", function(){
            that.sendMessage();
        }, false);
        this.inputElem.addEventListener("keyup", function(e){
            if(!e.shiftKey && e.keyCode === 13){
                that.sendMessage();
            }
        }, false);
        this.chatElem.addEventListener('wheel', function(e){
            console.log(that.chatElem.scrollTop);
            if(that.chatElem.scrollTop === 0 && e.deltaY < 0 && that.room.canLoadConversation) {
                that.room.getLastConversation.next();
            }
        })
    }
    sendMessage(){
        var text = this.inputElem.value;
        this.room.addMessage(profile.username, text);
        this.socket.send(JSON.stringify({
            roomId: this.room.id,
            // username: profile.username,
            text: this.inputElem.value
        }))
        this.inputElem.value = '';
    }
    setRoom(room){
        this.room = room;
        var that = this;
        if (this.room !== null) {
            this.room.onNewMessage = function(message){
                var div = document.createElement('div');
                if (message.username !== profile.username) {
                    div.className = "message";
                }
                else {
                    div.className = "message my-message";
                }
                var span1 = document.createElement('span');
                span1.className = "message-user";
                span1.innerText = sanitize(message.username);
                var span2 = document.createElement('span');
                span2.className = "message-text";
                span2.innerText = sanitize(message.text);
                div.appendChild(span1);
                div.appendChild(span2);
                that.chatElem.appendChild(div);
                console.log(div);
            }
            this.titleElem.innerText = room.name;
            emptyDOM(this.chatElem);
            var id;
            for (id = 0; id < this.room.messages.length; id++) {
                var message = this.room.messages[id];
                var div = document.createElement('div');
                if (message.username !== profile.username) {
                    div.className = "message";
                } else {
                    div.className = "message my-message";
                }
                var span1 = document.createElement('span');
                span1.className = "message-user";
                span1.innerText = message.username;
                var span2 = document.createElement('span');
                span2.className = "message-text";
                span2.innerText = message.text;

                div.appendChild(span1);
                div.appendChild(span2);
                this.chatElem.appendChild(div);
            }
            this.room.onFetchConversation = function(conversation){
                var hb = that.chatElem.scrollTop;
                var messages = conversation.messages;
                for(var i = messages.length - 1;  i >= 0; i-- ) {
                    var div = document.createElement('div');
                    if (messages[i].username !== profile.username) {
                        div.className = "message";
                    } else {
                        div.className = "message my-message";
                    }
                    var span1 = document.createElement('span');
                    span1.className = "message-user";
                    span1.innerText = messages[i].username;
                    var span2 = document.createElement('span');
                    span2.className = "message-text";
                    span2.innerText = messages[i].text;
                    div.appendChild(span1);
                    div.appendChild(span2);
                    that.chatElem.prepend(div);
                }
                var ha = that.chatElem.scrollTop;
                that.chatElem.scrollTop = ha - hb;
            }
        }
    }
}

class ProfileView {
    constructor(){
        this.elem = createDOM(
            `<div class = content>
                        <div class = profile-form>
                            <div class = form-field>
                                <label>Username</label>
                                <input type = "text">
                            </div>
                            <div class = form-field>
                                <label>Password</label>
                                <input type = "password">
                            </div>
                            <div class = form-field>
                                <label>Avatar image</label>
                                <input type = "file">
                            </div>
                            <div class = form-field id = form-field-about>
                                <label>About</label>
                                <textarea></textarea>
                            </div>
                        </div>
                        <div class = page-control>
                            <button>save</button>
                        </div>
                </div>`
        );
    }
}

class Room {
    constructor(id, name, image="assets/everyone-icon.png", messages=[]) {
        this.id = id;
        this.name = name;
        this.image = image;
        this.messages = messages;
        this.timestamp = Date.now();
        this.getLastConversation = makeConversationLoader(this);
        this.canLoadConversation = true;
    }
    addMessage(username, text){
        if (text.trim() === "") {
            return;
        }
        var message = {
            username: username,
            text: text
        };
        this.messages.push(message);
        if (this.onNewMessage !== undefined){
            this.onNewMessage(message);
        }
    }
    addConversation(conversation) {
        this.messages = conversation.messages.concat(this.messages);
        if (this.onFetchConversation !== undefined) {
            this.onFetchConversation(conversation);
        }
    }
}

class Lobby{
    constructor() {
        this.rooms = {
            // "0": new Room("0", "Everyone in CPEN400A","assets/everyone-icon.png"),
            // "1": new Room("1", "Foodies only","assets/bibimbap.png"),
            // "2": new Room("2", "Gamers unite","assets/minecraft.png"),
            // "3": new Room("3", "Canucks Fans","assets/canucks.png"),
        };
        this.count = 0;
    }
    getRoom(roomId){
        if (this.rooms[roomId] !== undefined) {
            return this.rooms[roomId];
        }else{
            return null;
        }
    }
    addRoom(id, name, image, messages){
        this.rooms[id] = new Room(id, name, image, messages);
        if (this.onNewRoom !== undefined){
            this.onNewRoom(this.rooms[id]);
        }
    }
}

var Service = {
    origin: window.location.origin,
    getAllRooms: function(){
        return new Promise((resolve, reject)=>{
            var xhr = new XMLHttpRequest();
            xhr.open("GET", Service.origin + "/chat");
            xhr.onload = function() {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(xhr.responseText));
                }
            }
            xhr.onerror = function(err){
                reject(new Error(err));
            }
            xhr.send();
        });
    },
    addRoom: function(data){
        return new Promise((resolve, reject)=>{
            var xhr = new XMLHttpRequest();
            xhr.open("POST", Service.origin + "/chat");
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.onload = function() {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(xhr.responseText));
                }
            }
            xhr.onerror = function(err){
                reject(new Error(err));
            }
            xhr.send(JSON.stringify(data));
        });
    },
    getLastConversation: function(roomId, before){
        return new Promise((resolve, reject)=>{
            var xhr = new XMLHttpRequest();
            xhr.open("GET", Service.origin + "/chat/" + roomId + "/messages?before=" + before);
            xhr.onload = function() {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(xhr.responseText));
                }
            }
            xhr.onerror = function(err){
                reject(new Error(err));
            }
            xhr.send();
        });
    },
    getProfile: function(){
        return new Promise((resolve, reject)=>{
            var xhr = new XMLHttpRequest();
            xhr.open("GET", Service.origin + "/profile");
            xhr.onload = function() {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(xhr.responseText));
                }
            }
            xhr.onerror = function(err){
                reject(new Error(err));
            }
            xhr.send();
        });
    }
};

function main(){
    var socket = new WebSocket("ws://localhost:8000");
    var lobby = new Lobby();
    var lobbyView = new LobbyView(lobby);
    var chatView = new ChatView(socket);
    var profileView = new ProfileView();
    socket.addEventListener("message", function(message){
        var m = JSON.parse(message.data);
        var room = lobby.getRoom(m.roomId);
        room.addMessage(m.username, m.text);
    })

    Service.getProfile().then((result) => {
        profile['username'] = result['username'];
    })

    var renderRoute = function(){
        var url = window.location.hash;
        if (url.includes('#/')){
            emptyDOM(document.getElementById("page-view"));
            document.getElementById("page-view").appendChild(lobbyView.elem);
        }
        if (url.includes('#/chat')){
            var split = url.split('/');
            chatView.setRoom(lobby.getRoom(split[split.length - 1]));
            emptyDOM(document.getElementById("page-view"));
            document.getElementById("page-view").appendChild(chatView.elem);
        }
        if (url.includes('#/profile')){
            emptyDOM(document.getElementById("page-view"));
            document.getElementById("page-view").appendChild(profileView.elem);
        }
    };
    renderRoute();
    window.addEventListener("popstate", renderRoute, false);
    var refreshLobby = function(){
        var action = Service.getAllRooms();
        action.then(
            (serverRoom)=> {
                // console.log(serverRoom);
                for (var i = 0; i < serverRoom.length; i++){
                    var room = lobby.getRoom(serverRoom[i]._id);
                    if (room !== null){
                        room.name = serverRoom[i].name;
                        room.image = serverRoom[i].image;
                    }else{
                        lobby.addRoom(serverRoom[i]._id, serverRoom[i].name, serverRoom[i].image, serverRoom[i].messages);
                    }
                }
            }
        )
    };
    refreshLobby();
    setInterval(refreshLobby, 10000);
    cpen322.export(arguments.callee, { renderRoute, lobbyView, chatView, profileView , lobby});
    cpen322.export(arguments.callee, { refreshLobby, lobby, socket});
}
window.addEventListener("load", main, false);
