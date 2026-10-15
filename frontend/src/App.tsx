import ErrorBoundary from "./components/ErrorBoundary";
import Game from "./game/Game";

export default function App() {
  return (
    <ErrorBoundary resetKey="game">
      <Game />
    </ErrorBoundary>
  );
}
