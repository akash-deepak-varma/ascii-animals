import { mountTweakPanel, type Control, type ControlKit } from "./panel";
import { mountSettings } from "./settings";
import { mountShortcuts, type Shortcuts } from "./shortcuts";
import { getSettings, store, type Settings } from "./store";
import { ANIMAL_KEYS, ANIMALS, AnimalEngine, SHARED_CONTROLS, type AnimalKey, type KnobSpec, type Tuning } from "./src";
import { mountChoices, mountComposer, mountGreeting } from "./ui";

const params = new URLSearchParams(location.search);
const isAnimal = (key: string | null): key is AnimalKey => key !== null && key in ANIMALS;

/** Each animal's tweaks are saved under their own key. */
const storageKey = (key: AnimalKey) => `tweaks:${key}`;

/** A random animal other than `not`. */
function randomAnimal(not: AnimalKey): AnimalKey {
  const others = ANIMAL_KEYS.filter((k) => k !== not);
  return others[Math.floor(Math.random() * others.length)];
}

async function main() {
  await store.ready();
  const settings = getSettings();

  // ?animal=koi picks the animal; otherwise a fresh random one if "each new tab" rotation is on;
  // otherwise the last one picked. ?count=60 pins how many. No count: sized to the screen.
  // Only a pick made in the animal bar is remembered: ?animal= and auto-rotation never overwrite it.
  const count = Number(params.get("count")) || undefined;
  const saved = store.get<string | null>("animal", null);
  const savedAnimal: AnimalKey = isAnimal(saved) ? saved : "butterflies";
  let animal: AnimalKey = isAnimal(params.get("animal"))
    ? (params.get("animal") as AnimalKey)
    : settings.rotate === "newTab"
      ? randomAnimal(savedAnimal)
      : savedAnimal;

  // Dark mode only: every animal is tuned to glow on black.
  const engine = new AnimalEngine(document.querySelector("canvas")!, { animal, count, theme: "dark" });
  engine.setPowerSaver(settings.powerSaver);

  // ── tweak panel: shared Movement and Look knobs around the animal's own ──

  function controlsFor(key: AnimalKey) {
    const a = ANIMALS[key];
    const hidden = new Set<string>(a.hide ?? []);
    return (kit: ControlKit<Tuning>): [string, Control[]][] => {
      const build = (spec: KnobSpec): Control => {
        if ("toggle" in spec) return kit.toggle(spec.key, spec.label, spec.hint);
        const knob = kit.knob(spec.key, spec.label, spec.min, spec.max, spec.step, spec.hint);
        const when = spec.disabledWhen;
        return when ? { ...knob, disabled: () => Boolean(engine.tuning[when]) } : knob;
      };
      const keep = (specs: KnobSpec[]) => specs.filter((s) => !hidden.has(s.key)).map(build);
      return [
        ["Movement", keep(SHARED_CONTROLS.movement)],
        ...a.controls.map(([title, specs]): [string, Control[]] => [title, specs.map(build)]),
        ["Look", keep(SHARED_CONTROLS.look)],
      ];
    };
  }

  /** What the saved tweaks for the current animal looked like when we last read or wrote them. */
  let tweaksSnapshot = "";
  const snapshot = () => (tweaksSnapshot = JSON.stringify(store.get(storageKey(animal), null)));

  const mountTweaks = () => {
    const panel = mountTweakPanel(engine, ANIMALS[animal].defaults, controlsFor(animal), {
      storageKey: storageKey(animal),
      onChange: snapshot,
    });
    snapshot();
    return panel;
  };
  let tweaks = mountTweaks();

  // ── animal choices: every animal in the top bar, each with a dot of its own colour ──

  /** The one way to change animal: the picker, auto-rotate and other tabs all come through here. */
  function switchAnimal(key: AnimalKey, { persist, moveThumb = true }: { persist: boolean; moveThumb?: boolean }) {
    if (key === animal) return;
    animal = key;
    engine.setAnimal(animal);
    tweaks.destroy();
    tweaks = mountTweaks();
    if (moveThumb) choices.select(animal);
    if (persist) store.set("animal", animal);
  }

  const choices = mountChoices(
    document.querySelector<HTMLElement>(".choices")!,
    ANIMAL_KEYS.map((key) => ({ value: key, label: ANIMALS[key].label, swatch: `rgb(${ANIMALS[key].swatch.join(",")})` })),
    animal,
    (value) => {
      switchAnimal(value as AnimalKey, { persist: true, moveThumb: false });
      restartRotation();
    },
  );

  // ── greeting, search box, shortcuts ──

  const composer = document.querySelector<HTMLElement>(".composer")!;
  const greeting = document.querySelector<HTMLElement>(".greeting")!;
  const stage = document.querySelector<HTMLElement>(".stage")!;
  const shortcutsHost = document.querySelector<HTMLElement>(".shortcuts")!;

  mountComposer();
  const refreshGreeting = mountGreeting(() => getSettings().name);

  // ── auto-rotate ──

  let rotateTimer = 0;
  function restartRotation() {
    clearInterval(rotateTimer);
    rotateTimer = 0;
    const s = getSettings();
    if (s.rotate !== "timer") return;
    rotateTimer = window.setInterval(() => {
      if (!document.hidden) switchAnimal(randomAnimal(animal), { persist: false });
    }, s.rotateMinutes * 60_000);
  }

  // ── apply settings ──

  let shownShortcuts: Settings["shortcuts"] | null = null;
  let shortcuts: Shortcuts | null = null;
  function applySettings(s: Settings, changed?: keyof Settings | "sync") {
    greeting.hidden = !s.showGreeting;
    composer.hidden = !s.showSearch;
    stage.classList.toggle("no-search", !s.showSearch);
    engine.setPowerSaver(s.powerSaver);
    refreshGreeting();
    if (shownShortcuts !== s.shortcuts) {
      shownShortcuts = s.shortcuts;
      shortcuts?.dispose();
      shortcuts = s.shortcuts === "off" ? null : mountShortcuts(shortcutsHost, s.shortcuts);
    }
    if (changed === "rotate" || changed === "rotateMinutes" || changed === undefined) restartRotation();
  }
  applySettings(settings);

  const settingsUi = mountSettings({
    onChange: (s, changed) => {
      applySettings(s, changed);
      // Turning sync on can bring in tweaks from another device; reload so everything agrees.
      if (changed === "sync" && JSON.stringify(store.get(storageKey(animal), null)) !== tweaksSnapshot) {
        const next = new URLSearchParams(location.search);
        next.set("settings", "1");
        location.search = next.toString();
      }
    },
  });

  // Another tab (or another device, with Sync on) changed something we use.
  store.onExternalChange = (key) => {
    if (key === storageKey(animal)) {
      // Reload, so this tab never writes its stale tweaks back over the newer ones.
      location.reload();
    } else if (key === "settings") {
      applySettings(getSettings());
      settingsUi.refresh();
    }
    // A different saved animal only applies to the next new tab; this one keeps what it's showing.
  };
}

void main();
