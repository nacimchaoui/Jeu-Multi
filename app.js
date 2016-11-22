var mongojs = require("mongojs");
var db = mongojs('localhost:27017/jeu', ['user']);

var express = require('express');
var app = express();
var serv = require('http').Server(app);

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/client/index.html');
});
app.use('/client', express.static(__dirname + '/client'));

serv.listen(2000);
console.log("Serveur démarré.");

var io = require('socket.io')(serv, {});


// Ajout joueur dans la db
var ajoutJoueur = function(data) {
    db.user.insert({
        pseudo: data.pseudo,
        score: data.score
    });
};

// Couleur au hasard
var couleur = function() {
    var lettres = '0123456789ABCDEF'.split('');
    var couleur = '#';
    for (var i = 0; i < 6; i++) {
        couleur += lettres[Math.floor(Math.random() * 16)];
    }
    return couleur;
};

// Collision
var intersection = function(min0, max0, min1, max1) {
    return Math.max(min0, max0) >= Math.min(min1, max1) &&
        Math.min(min0, max0) <= Math.max(min1, max1);
};

var collision = function(r0, r1) {
    return intersection(r0.x, r0.x + r0.width, r1.x, r1.x + r1.width) &&
        intersection(r0.y, r0.y + r0.height, r1.y, r1.y + r1.height);
};


// Random position
var random = function(debut, fin) {
    return Math.floor(Math.random() * (fin - debut + 1) + debut);
};

// Fct constructeur des objets
var Objet = function() {
    var objet = {
        x: random(10, 842),
        y: random(10, 392),
        width: 5,
        height: 5,
        color: "red",
    };
    objet.collision = function(arg) {
        if (collision(arg, objet)) {

            objet.x = random(10, 842);
            objet.y = random(10, 392);

            arg.score += 1;
        }

    };
    return objet;
};

var objet = new Objet();

var Connexions = {};
var Joueurs = {};
var tableauJoueurs = [];

var pseudo = db.user.find({}, {
    pseudo: 1,
    _id: 0
});

// Fct constructeur avatar
var Avatar = function(id) {
    var self = {
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        id: id,
        pseudo: 'test',
        couleur: couleur(),
        haut: false,
        bas: false,
        gauche: false,
        droite: false,
        posx: 0,
        posy: 0,
        mvt: 10,
        score: 0,
    };
    self.coord = function() {
        if (self.haut)
            self.y -= self.mvt;
        if (self.bas)
            self.y += self.mvt;
        if (self.gauche)
            self.x -= self.mvt;
        if (self.droite)
            self.x += self.mvt;
        if (self.y + 10 >= 399)
            self.y = 389;
        if (self.y < 10)
            self.y = 10;
        if (self.x + 10 >= 849)
            self.x = 839;
        if (self.x < 10)
            self.x = 10;
    };
    self.nouvellePosition = function() {

    };
    return self;
};

io.sockets.on('connection', function(socket) {

    socket.id = Math.random();
    Connexions[socket.id] = socket;

    var joueur = new Avatar(socket.id);

    socket.on('jouer', function(data) {
        socket.emit('ajoutReponse', {success: true});
        db.user.aggregate([{$sort: {score: -1}}]).limit(5).toArray(function(err, result) {
            if (err) {} else if (result.length) {
                socket.emit('topScore', result);
            }
        });
        joueur.pseudo = data.pseudo;
        Joueurs[socket.id] = joueur;
        for (var i = 0; i < tableauJoueurs.length; i++) {
            if (joueur.pseudo === tableauJoueurs[i]) {
                tableauJoueurs.splice(joueur.pseudo);
                socket.emit('erreur', {
                    erreur: joueur.pseudo
                });
            }
        }
        tableauJoueurs.push(joueur.pseudo);
    });

    socket.on('mouvement', function(data) {
        if (data.idTouche === 'gauche')
            joueur.gauche = data.state;
        else if (data.idTouche === 'droite')
            joueur.droite = data.state;
        else if (data.idTouche === 'haut')
            joueur.haut = data.state;
        else if (data.idTouche === 'bas')
            joueur.bas = data.state;
    });

    socket.on('gagnant', function(data) {

        db.user.aggregate([{
            $sort: {
                score: -1
            }
        }]).limit(5).toArray(function(err, result) {
            if (err) {} else if (result.length) {
                socket.emit('topScore', result);
            }
        });
    });


    socket.on('disconnect', function() {
        delete Connexions[socket.id];
        delete Joueurs[socket.id];
        console.log('déconnecté');
    });
});

var si = setInterval(function() {
    var tab = [];
    for (var i in Joueurs) {
        var joueur = Joueurs[i];
        var gagnant;
        objet.collision(joueur);
        joueur.coord();
        tab.push({
            // Joueur
            x: joueur.x,
            y: joueur.y,
            pseudo: joueur.pseudo,
            couleur: joueur.couleur,
            score: joueur.score,
            id: joueur.id,
            // Objets
            objx: objet.x,
            objy: objet.y,
            objcouleur: objet.color
        });
        if (joueur.score === 11) {
            gagnant = joueur;
        }
    }

    for (var i in Connexions) {
        var socket = Connexions[i];
        socket.emit('joueur', tab);
        if (gagnant != null) {
            socket.emit('fin', gagnant);
            delete Connexions[socket.id];
            delete Joueurs[socket.id];
            ajoutJoueur(gagnant);
        }
    }
}, 1000 / 25);
