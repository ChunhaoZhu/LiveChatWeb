const crypto = require('crypto');
const http = require('http');

class SessionError extends Error {};

function SessionManager (){
    // default session length - you might want to
    // set this to something small during development
    const CookieMaxAgeMs = 600000;

    // keeping the session data inside a closure to keep them protected
    const sessions = {};

    // might be worth thinking about why we create these functions
    // as anonymous functions (per each instance) and not as prototype methods
    this.createSession = (response, username, maxAge = CookieMaxAgeMs) => {
        /* To be implemented */
        var token = crypto.randomBytes(20).toString('base64');
        var object = {
            username: username,
            createTime: Date.now(),
            expireTime: Date.now() + maxAge
        }
        sessions[token] = object;
        response.cookie('cpen322-session', token,  {maxAge: maxAge, encode: String});
        setTimeout(()=> {
            delete sessions[token];
        }, maxAge);
    };

    this.deleteSession = (request) => {
        /* To be implemented */
        delete request.username;
        delete sessions[request.session];
        delete request.session;
    };

    this.middleware = (request, response, next) => {
        /* To be implemented */
        var cookies = request.headers.cookie;
        // console.log(cookies);
        if (cookies){
            var cookie = cookies.split(';').filter(str => {
                return str.includes('cpen322-session');
            })
            // console.log(cookie);
            if (cookie && cookie.length >= 1){
                cookie = cookie[0].trim().substring(16);
                // console.log(cookie);
                if (sessions[cookie]){
                    request.username = sessions[cookie]['username'];
                    request.session = cookie;
                    next();
                }else{
                    next(new SessionError("Token not found in sessions."));
                }
            }else{
                next(new SessionError("Cookie not found."));
            }
        }else {
            next(new SessionError("Cookie header not found."));
        }
    };

    // this function is used by the test script.
    // you can use it if you want.
    this.getUsername = (token) => ((token in sessions) ? sessions[token].username : null);
};

// SessionError class is available to other modules as "SessionManager.Error"
SessionManager.Error = SessionError;

module.exports = SessionManager;