process.env.DEBUG = "ta:*";
process.env.PORT = 3000;

const config = require('./config');
const express = require('express');
const debug = require('debug');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const LevelStore = require('level-session-store')(session);
const http = require('http');
const socketio = require('socket.io');
const sharedsession = require("express-socket.io-session");

const log = debug('ta:server');
const log_req = debug('ta:req');

const utilmisc = require('./util/misc');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/views'));

app.use(cors({credentials: true, origin: true, maxAge: 7200}));

app.use(function (req, res, next) {
    req.reqid = utilmisc.genId();
    next();
});
const mySession = session({
    cookie: {maxAge: 31556952000, sameSite: false},
    secret: "mylittlesecret",
    resave: false,
    saveUninitialized: false,
    store: new LevelStore(config.datadir + '/session_db')
});
app.use(mySession);

morgan.token('reqid', function (req, res) {
    return req.reqid;
});
morgan.token('raddr', function (req, res) {
    const addr = req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',');
    return (addr && addr[0]) || req.connection.remoteAddress;
});
const morgan_format = '[:reqid] :method :url :status :response-time ms - :res[content-length] [:raddr]';

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(morgan(morgan_format, {stream: {write: msg => log_req(msg.trimEnd())}}));
require('./express_routes').setup(app);
app.use('/api', (err, req, res, next) => {
    log('Uncaught Error: ', err);
    return res.json({reqid: req.reqid, code: 500, msg: 'Unknown error', err: err.message});
});

app.use(express.static(__dirname + '/../public'));

const server = http.createServer(app);
const io = exports.io = socketio(server);
io.use(sharedsession(mySession, {
    autoSave: true,
    resave: false,
    saveUninitialized: false,
}));
require('./express_io').setup(io);

exports.start = function () {
    const listener = server.listen(process.env.PORT, function () {
        log("Your app is listening on port " + listener.address().port);
    });
};
