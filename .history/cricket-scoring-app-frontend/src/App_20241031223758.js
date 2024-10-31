import React from 'react';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';
import Home from './components/Home';
import LiveMatch from './components/LiveMatch';
import MatchHistory from './components/MatchHistory';
import Teams from './components/Teams';
import Players from './components/Players';
import Footer from './components/Footer';
import Header from './components/Header';

function App() {
  return (
    <Router>
      <Header />
      <Switch>
        <Route path="/" exact component={Home} />
        <Route path="/live-match" component={LiveMatch} />
        <Route path="/match-history" component={MatchHistory} />
        <Route path="/teams" component={Teams} />
        <Route path="/players" component={Players} />
      </Switch>
      <Footer />
    </Router>
  );
}

export default App;
