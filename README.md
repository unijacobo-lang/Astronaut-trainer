# ☾ Lunar Outpost — Base Management

A lunar base management simulation built for the **NASA Space Apps Challenge**.
Build a sustainable outpost on the Moon: manage oxygen, water, food, materials
and budget, research new technology, and survive the yearly mission that decides
the fate of the base.

> Play it live: **https://unijacobo-lang.github.io/Astronaut-trainer/**

---

## ✨ Features

- **Real-time simulation** — one simulated hour per tick, with 1× / 2× / 4× speed.
- **Life support model** — 21% optimal atmosphere, crew consumption based on NASA
  reference values (0.84 kg O₂, 3.5 L water, 0.83 kg food per crew per day).
- **Procedural canvas scene** — hand-painted pixel art of your growing base,
  astronauts walking between modules, solar-storm effects.
- **9 buildings** — habitats, solar arrays, batteries, oxygen generators, water
  reclaimers, greenhouses, regolith fabricators, labs and radiation shelters.
- **9 research projects** — with success chances; a failed project loses the
  investment.
- **Yearly missions** — one mission per year, with dynamic success chance based
  on atmosphere efficiency and shield integrity. Failure ends the run.
- **Radiation / DONKI-inspired storms** — shelter your crew, reinforce the shield.
- **Autosave** — persists to `localStorage` every 5 seconds and on tab close.
- **Responsive + accessible** — keyboard controls, reduced-motion support,
  high-contrast mode.

## 🕹️ Controls

| Key            | Action              |
| -------------- | ------------------- |
| `Space`        | Pause / resume      |
| `1` / `2` / `4`| Game speed          |
| Tabs           | Base / Research / Missions / Crew |

## 🚀 Getting started

```bash
# Clone the repository
git clone https://github.com/unijacobo-lang/Astronaut-trainer.git
cd Astronaut-trainer

# Install dependencies
npm install

# Start the dev server (http://localhost:3000)
npm run dev

# Production build → dist/
npm run build

# Preview the production build
npm run preview
```

## 📁 Project structure

```
Astronaut-trainer/
├── index.html              # Vite entry point (markup skeleton)
├── package.json
├── vite.config.js
├── public/
│   └── favicon.svg
├── src/
│   ├── config.js           # All game content & balance values
│   ├── state.js            # Run state shape + pure helpers (rates, conditions)
│   ├── actions.js          # Player actions (build, repair, research, missions…)
│   ├── simulation.js       # Hourly tick: resources, radiation, missions
│   ├── scene.js            # Procedural canvas rendering
│   ├── ui.js               # DOM creation & rendering
│   ├── storage.js          # localStorage persistence + save sanitization
│   ├── main.js             # Bootstrap & game loop
│   └── styles/
│       ├── main.css        # Imports all styles
│       ├── variables.css   # Design tokens
│       ├── layout.css      # App shell, panels, buttons
│       ├── components.css  # Cards, research, missions, crew
│       └── responsive.css  # Media queries & accessibility
└── .github/
    └── workflows/
        └── deploy.yml      # Auto-deploy to GitHub Pages
```

### Architecture principles

- **Separation of concerns** — simulation logic (`state.js`, `simulation.js`,
  `actions.js`) never touches the DOM; `ui.js` and `scene.js` never mutate
  state; `storage.js` owns persistence.
- **Data-driven content** — every tunable number and every building/research/
  mission definition lives in `config.js`. Adding content does not require
  changing engine code.
- **Deterministic helpers** — `getRates()` is a pure read used by both the HUD
  and the hourly tick, so what you see is what the simulation applies.

## 🧪 Tech stack

- Vanilla JavaScript (ES modules)
- [Vite](https://vitejs.dev/) for dev server & bundling
- Canvas 2D for the base scene
- No runtime dependencies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-idea`
3. Commit your changes: `git commit -m "feat: my idea"`
4. Push and open a Pull Request

## 📄 License

[MIT](./LICENSE) © unijacobo-lang

---

Made with ☾ for the NASA Space Apps Challenge.
