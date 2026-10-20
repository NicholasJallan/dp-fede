// DP Assistant — ErrorBoundary : écran de secours au lieu d'une page blanche.
//
// Un crash de rendu dans un écran ne doit jamais faire perdre la main au DP
// sur le terrain : on affiche l'erreur et deux actions (réessayer / recharger).
// Les données sont déjà persistées par l'auto-save et l'outbox.

import React from 'react';
import { StatusIcon } from './icons.jsx';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[DP] Erreur de rendu :', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Changer d'écran réinitialise la frontière.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.reset();
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="error-screen" role="alert" aria-labelledby="error-screen-title">
        <h2 id="error-screen-title"><StatusIcon tone="err" />Cet écran n'a pas pu s'afficher</h2>
        <p>
          Vos saisies sont enregistrées sur cet appareil. Réessayez l'affichage
          ou rechargez l'application.
        </p>
        <pre className="error-screen-detail">{String(this.state.error?.message || this.state.error)}</pre>
        <div className="error-screen-actions">
          <button type="button" className="btn" onClick={this.reset}>Réessayer</button>
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>Recharger</button>
        </div>
      </section>
    );
  }
}
