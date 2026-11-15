/**
 * Page chrome shared by every scene: glass segmented choices, the search box and the greeting.
 */
/**
 * A greeting by the local time: "Good morning, Stephen" … "Still up, Stephen?" after 10pm.
 * With no name it's just "Good morning" … "Still up?".
 */
export function greetingFor(name: string, date = new Date()) {
  const h = date.getHours();
  const who = name.trim();
  const tail = who ? `, ${who}` : "";
  if (h >= 5 && h < 12) return `Good morning${tail}`;
  if (h >= 12 && h < 17) return `Good afternoon${tail}`;
  if (h >= 17 && h < 22) return `Good evening${tail}`;
  return `Still up${tail}?`;
}

/**
 * Greet by the time of day, and keep it current if the page stays open. `getName` is read each
 * time, so a name changed in Settings shows up on the next refresh() (returned).
 */
export function mountGreeting(getName: () => string) {
  const el = document.querySelector<HTMLElement>(".greeting");
  if (!el) return () => {};
  const update = () => (el.textContent = greetingFor(getName()));
  update();
  setInterval(update, 60_000);
  return update;
}

/** Where a typed line should go: a web address to open, or a search. */
export function resolveQuery(text: string): { url: string } | { search: string } {
  if (/^https?:\/\/\S+$/i.test(text)) return { url: text };
  // "example.com", "localhost:3000/x", "192.168.0.1": a single word that looks like an address.
  if (/^(localhost|(\d{1,3}\.){3}\d{1,3}|([a-z0-9-]+\.)+[a-z]{2,})(:\d+)?([/?#]\S*)?$/i.test(text)) {
    return { url: `https://${text}` };
  }
  return { search: text };
}

/** Run it in the current tab: through the browser's default search engine (or Google outside Chrome). */
function go(text: string) {
  const target = resolveQuery(text);
  if ("url" in target) {
    location.href = target.url;
  } else if (typeof chrome !== "undefined" && chrome.search?.query) {
    chrome.search.query({ text: target.search, disposition: "CURRENT_TAB" });
  } else {
    location.href = `https://www.google.com/search?q=${encodeURIComponent(target.search)}`;
  }
}

/** Voice input where the browser has it; the button is hidden where it doesn't. */
function mountVoice(button: HTMLButtonElement, prompt: HTMLTextAreaElement, fit: () => void) {
  const Recognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  if (!Recognition) {
    button.hidden = true;
    return;
  }
  let active: any = null;
  button.addEventListener("click", () => {
    if (active) {
      active.stop();
      return;
    }
    const rec = new Recognition();
    rec.interimResults = true;
    rec.lang = navigator.language;
    const before = prompt.value ? `${prompt.value.trim()} ` : "";
    rec.onresult = (e: any) => {
      let heard = "";
      for (const r of e.results) heard += r[0].transcript;
      prompt.value = before + heard;
      fit();
    };
    rec.onend = () => {
      active = null;
      button.classList.remove("listening");
      prompt.focus();
    };
    // No microphone, or the user said no: just carry on typing.
    rec.onerror = () => rec.stop();
    active = rec;
    button.classList.add("listening");
    try {
      rec.start();
    } catch {
      active = null;
      button.classList.remove("listening");
    }
  });
}

/**
 * The search box. A submit opens the address or runs the search, and also fires a `chat:submit`
 * event on the form (with `{ text }`), as the original chat input did.
 */
export function mountComposer() {
  const form = document.querySelector<HTMLFormElement>(".composer")!;
  const prompt = form.querySelector("textarea")!;
  const send = form.querySelector<HTMLButtonElement>(".send")!;

  function fit() {
    prompt.style.height = "auto";
    prompt.style.height = `${prompt.scrollHeight}px`;
    // Scroll only once it hits its max height; below that it just grows.
    prompt.style.overflowY = prompt.scrollHeight > prompt.clientHeight + 1 ? "auto" : "hidden";
    send.disabled = prompt.value.trim() === "";
  }

  prompt.addEventListener("input", fit);
  // Ready to type on load where there's a mouse; on a phone that would throw the keyboard up.
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) prompt.focus({ preventScroll: true });
  prompt.addEventListener("keydown", (e) => {
    // Enter sends, Shift+Enter is a newline; leave Enter alone mid-IME composition.
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = prompt.value.trim();
    if (!text) return;
    form.dispatchEvent(new CustomEvent("chat:submit", { detail: { text } }));
    go(text);
    prompt.value = "";
    fit();
  });

  mountVoice(form.querySelector<HTMLButtonElement>(".voice")!, prompt, fit);
}

export interface Choice {
  value: string;
  label: string;
  /** CSS colour for a dot before the label; none if left out. */
  swatch?: string;
}

/**
 * A glass segmented control in `host` (a radiogroup): every choice in a row, with a thumb that slides
 * under the current one. Arrow keys move between them; the row scrolls sideways if it doesn't fit.
 */
export function mountChoices(host: HTMLElement, choices: Choice[], current: string, onPick: (value: string) => void) {
  const thumb = document.createElement("span");
  thumb.className = "thumb";
  thumb.setAttribute("aria-hidden", "true");
  host.append(thumb);

  const buttons = choices.map((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.dataset.value = c.value;
    const dot = c.swatch ? `<span class="dot" style="--swatch: ${c.swatch}" aria-hidden="true"></span>` : "";
    b.innerHTML = `${dot}<span>${c.label}</span>`;
    b.addEventListener("click", () => select(c.value, true));
    host.append(b);
    return b;
  });

  function place() {
    const b = buttons.find((x) => x.getAttribute("aria-checked") === "true");
    if (!b) return;
    thumb.style.translate = `${b.offsetLeft}px 0`;
    thumb.style.width = `${b.offsetWidth}px`;
  }

  function select(value: string, pick: boolean) {
    for (const b of buttons) {
      const on = b.dataset.value === value;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) b.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    place();
    if (pick) onPick(value);
  }

  host.addEventListener("keydown", (e) => {
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0 || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    e.preventDefault();
    const next = buttons[(at + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
    next.focus();
    select(next.dataset.value!, true);
  });

  select(current, false);
  // Labels change width once the webfont arrives, and when the window resizes.
  document.fonts?.ready.then(place);
  window.addEventListener("resize", place);

  // Move the highlight to a choice from code (e.g. auto-rotate) without firing onPick.
  return { select: (value: string) => select(value, false) };
}
