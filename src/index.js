var http = require('http');
var app = http.createServer();

// Socket.io server listens to our app
var io = require('socket.io').listen(app);
const NROCARTAS=433;
const CARITAS=12;

var nroSalas = 0;
var salas = [];

var backupState = {
  jugadorActivo:"**",
  seeOthersCards:false,

  yaseleciono:false,
  yavoto:false,

  nrojugadores:0,
  nrocartas:0,
  puntajeEndgame:0,
  step: "esperando",
  createdGame: false,
  players: [],
  votacion: []
};
var serverInfoGame = {
  cartasEnElMaso: NROCARTAS,
  deck: []
};
var partidaActual = {
  jcuentacuentos:0,
  index:0,
  carta:0,
  others: [],
  votos: []
};

var caritas = {
  difCaritas: CARITAS,
  arrayCarita: []
};

io.on('connection', function (socket) {
  console.log('a user connected');
	socket.on('disconnect', () => {
    console.log('user disconnected');
  });
  
  socket.emit('SUCCSESS', {message: 'Server Accecpting Connections'});
  socket.emit('INIT', backupState);

  process.on('SIGINT', () => {
    io.emit('SIGINT', {message: 'Server Shut Down'});
    process.exit();
  });

  //list events
  socket.on('newGame', function (payload) {
    payload.jugadorActivo = "**";
    serverInfoGame.deck = [];
    caritas.arrayCarita = [];
    iniciarDeck();
    iniciarCaritas();
    payload.players[0].perfil= repartirCaritas();
    payload.players[0].hand= repartir(payload.nrocartas);
    backupState = payload;
    socket.broadcast.emit('newGame', payload);   
  });

/*   socket.on('endGame', function (payload) {
    backupState = payload;
    io.emit('endGame', payload);    
  }); */

  socket.on('newConection', function (objplayer) {
    let existe = existeName(objplayer.name);
    if (existe) {
      console.log('volviendo a conectar a '+ objplayer.name);
      socket.emit('newConection', backupState.players);
      socket.emit('statusja', {yaseleciono: existe.yaseleciono, yavoto:existe.yavoto})
      socket.emit('changeVotos', partidaActual.others);
    //  if ( backupState.step == "votacion") {//check esto
    //    socket.emit('eligiendo', partidaActual.others);       
    //  }
    }
    else{
      if (backupState.players.length >= backupState.nrojugadores) {
        console.log('lleno. se intento conectar '+ objplayer.name);
        return;
      }
      console.log('conectar a '+ objplayer.name);
      objplayer.puntaje= 0;
      objplayer.perfil= repartirCaritas();
      objplayer.extrapoints= 0;
      objplayer.cuentacuentos= false;
      objplayer.yaseleciono= false;
      objplayer.yavoto= false;
      objplayer.position= backupState.players.length;
      objplayer.hand= repartir(backupState.nrocartas);      

      backupState.players.push(objplayer);
      io.emit('newConection', backupState.players);
      if (backupState.players.length == backupState.nrojugadores && backupState.step == "esperando"){
        backupState.step = "arrancamo";
        io.emit('changestatus', backupState.step);
      }
    }    
  });

  socket.on('cuentacuentos', function (payload) {
    partidaActual.others= [];
    partidaActual.votos= [];
    backupState.votacion= [];
    partidaActual.jcuentacuentos = payload.positionja;
    partidaActual.index = payload.index;
    partidaActual.carta = payload.carta;
    partidaActual.others.push(payload);//lo sumo tmb aca

    //habilita a todos y guarda por si se desconectan
    backupState.players.forEach(element => {
      element.yaseleciono= false;
      element.yavoto = false;      
    });
    backupState.players[payload.positionja].cuentacuentos = true;
    backupState.players[payload.positionja].yaseleciono = true;
    backupState.players[payload.positionja].yavoto = true;
    backupState.step = "eligiendo";
    socket.broadcast.emit('cuentacuentos', backupState.players);
    socket.broadcast.emit('statusja', {yaseleciono: false, yavoto: false});    
  });

  socket.on('eligiendo', function (payload) {
    console.log("un elegido")
    backupState.players[payload.positionja].yaseleciono = true;
    partidaActual.others.push(payload);

    if (partidaActual.others.length == backupState.nrojugadores){
      shuffleStep();
      backupState.step = "votacion";
      io.emit('eligiendo', partidaActual.others);

      backupState.players.forEach(element => {
        element.extrapoints = 0;
      });
      io.emit('changePlayers', backupState.players);      
    }
  });

  socket.on('votacion', function (payload) {
    console.log("un voto")
    backupState.players[payload.positionja].yavoto = true;
    partidaActual.votos.push(payload);
    if (partidaActual.votos.length == backupState.nrojugadores-1){
      console.log('votaron todos');
      resolverStep();
      backupState.step = "cuentacuentos";
      io.emit('votacion', partidaActual.others);
      io.emit('resultados', backupState.players);     
    }
  });

});

//app.listen(3000);
app.listen(8080);
console.log('Server listening on 3000');

//-------------------------------------------------------------

function resolverStep() {
  let acertaron= [];

  partidaActual.votos.forEach(voto => {
    if (voto.carta == partidaActual.carta ) {
      acertaron.push(voto.positionja);  
    }else{
      let jugadorVotado = partidaActual.others.find(element => element.carta == voto.carta);
      if (jugadorVotado){
        backupState.players[jugadorVotado.positionja].extrapoints++;
        backupState.players[jugadorVotado.positionja].puntaje++;
      }
    }
    console.log(voto.carta)
    console.log(partidaActual.others)
    let index = partidaActual.others.findIndex(element => element.carta == voto.carta);
    console.log(index)
    if (index >=0) partidaActual.others[index].votos += "  "+ backupState.players[voto.positionja].name;
  });

  if (acertaron.length == 0 || acertaron.length == backupState.nrojugadores-1) {
    partidaActual.votos.forEach(voto => {
      backupState.players[voto.positionja].extrapoints += 2;
      backupState.players[voto.positionja].puntaje += 2;
    });
  }else{
    if (acertaron.length == 1) {
      backupState.players[acertaron[0]].extrapoints += 4;
      backupState.players[acertaron[0]].puntaje += 4;

      backupState.players[partidaActual.jcuentacuentos].extrapoints += 4;
      backupState.players[partidaActual.jcuentacuentos].puntaje += 4;
    }
    else {
      backupState.players[partidaActual.jcuentacuentos].extrapoints += 3;
      backupState.players[partidaActual.jcuentacuentos].puntaje += 3;
      acertaron.forEach(acerto => {
        backupState.players[acerto].extrapoints += 3;
        backupState.players[acerto].puntaje += 3;
      });
    }
  }
  quitaryrepartir();
}

function quitaryrepartir() {
  partidaActual.others.forEach(ja => {
    backupState.players[ja.positionja].hand.splice(ja.index,1);
    if (serverInfoGame.cartasEnElMaso >= backupState.nrojugadores) backupState.players[ja.positionja].hand.push(repartir(1));
    if (ja.carta == partidaActual.carta) ja.islacuentacuentos = true; //marcamos la que era
  });
  // rota cambiacuentos
  backupState.players[partidaActual.jcuentacuentos].cuentacuentos= false;
  partidaActual.jcuentacuentos++;
  if (partidaActual.jcuentacuentos >= backupState.nrojugadores) partidaActual.jcuentacuentos=0;
  backupState.players[partidaActual.jcuentacuentos].cuentacuentos= true;
  backupState.players[partidaActual.jcuentacuentos].yaseleciono= false;
}

function repartir(cuantas) {
  let cards=[];
  for (let index = 0; index < cuantas; index++) {
     serverInfoGame.cartasEnElMaso--;
     cards.push(serverInfoGame.deck[serverInfoGame.cartasEnElMaso]);
     serverInfoGame.deck.pop();     
  }
  return cards;
}

function existeName(name) {
  return backupState.players.find(element => element.name == name);
}

function iniciarDeck() {
  serverInfoGame.cartasEnElMaso = NROCARTAS;
  for (let index = 1; index < NROCARTAS+1; index++) {
    serverInfoGame.deck.push(index);
  } 
  shuffle();
  shuffle();
}

function shuffle() {
  var m = NROCARTAS, t, i;
  // While there remain elements to shuffle…
  while (m) {
    // Pick a remaining element…
    i = Math.floor(Math.random() * m--);
    // And swap it with the current element.
    t = serverInfoGame.deck[m];
    serverInfoGame.deck[m] = serverInfoGame.deck[i];
    serverInfoGame.deck[i] = t;
  }
}

function shuffleStep() {
  var m = backupState.nrojugadores, t, i;
  // While there remain elements to shuffle…
  while (m) {
    // Pick a remaining element…
    i = Math.floor(Math.random() * m--);
    // And swap it with the current element.
    t = partidaActual.others[m];   
    partidaActual.others[m] = partidaActual.others[i];
    partidaActual.others[i] = t;
  }
}


function shuffleCaritas() {
  var m = CARITAS, t, i;
  // While there remain elements to shuffle…
  while (m) {
    // Pick a remaining element…
    i = Math.floor(Math.random() * m--);
    // And swap it with the current element.
    t = caritas.arrayCarita[m];
    caritas.arrayCarita[m] = caritas.arrayCarita[i];
    caritas.arrayCarita[i] = t;
  }
}

function iniciarCaritas() {
  caritas.difCaritas = CARITAS;
  for (let index = 1; index < CARITAS+1; index++) {
    caritas.arrayCarita.push(index);
  } 
  shuffleCaritas();
  shuffleCaritas();
}

function repartirCaritas() {
    caritas.difCaritas--;
    let xx = caritas.arrayCarita[caritas.difCaritas];
    caritas.arrayCarita.pop();
  return xx;
}