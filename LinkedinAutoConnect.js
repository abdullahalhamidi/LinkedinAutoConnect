(() => {
  if (window.liConnect?.isRunning?.()) {
    throw Error("Stop the existing run first.");
  }

  window.liConnect?.stop?.();

  const selected = typeof $0 !== "undefined" ? $0 : null;
  const selectedRoot = selected?.getRootNode();
  const retainedRoot = selectedRoot?.host ? selectedRoot : null;

  const previous = (() => {
    try {
      return JSON.parse(window.liConnect?.report?.() || "{}");
    } catch {
      return {};
    }
  })();

  const tried = new Set(previous.attempted || []);
  const logs = [];

  const CONNECT = 'a[href*="/preload/search-custom-invite/"]';
  const NEXT =
    'button[data-testid="pagination-controls-next-button-visible"]';

  let running = false;
  let stopped = false;
  let stage = "idle";

  const text = e =>
    (e?.textContent || "").replace(/\s+/g, " ").trim();

  const visible = e =>
    !!e?.isConnected &&
    e.getClientRects().length > 0 &&
    e.ownerDocument.defaultView.getComputedStyle(e).visibility !== "hidden";

  const enabled = e =>
    !e.disabled && e.getAttribute("aria-disabled") !== "true";

  // Search the document, open shadow roots, and the inspected root.
  function all(selector) {
    const found = new Set();
    const visited = new Set();

    function walk(root) {
      if (!root || visited.has(root)) return;
      visited.add(root);

      root.querySelectorAll(selector).forEach(e => found.add(e));

      root.querySelectorAll("*").forEach(e => {
        if (e.shadowRoot) walk(e.shadowRoot);
      });
    }

    walk(document);

    if (retainedRoot?.host.isConnected) {
      walk(retainedRoot);
    }

    return [...found];
  }

  const dialogs = () =>
    all('dialog,[role="dialog"],[role="alertdialog"]').filter(visible);

  const buttons = d =>
    [...d.querySelectorAll("button")].filter(visible);

  function log(event, data = {}, error = false) {
    const row = {
      time: new Date().toISOString(),
      stage,
      event,
      ...data
    };

    logs.push(row);
    console[error ? "error" : "log"](
      `[LI] ${stage}: ${event}`,
      data
    );
  }

  function diagnostics() {
    return {
      connectLinks: all(CONNECT).filter(visible).length,
      retainedRootMode: retainedRoot?.mode || null,
      retainedRootConnected: !!retainedRoot?.host.isConnected,
      dialogs: dialogs().map(d => ({
        text: text(d).slice(0, 600),
        buttons: buttons(d).map(
          b => b.getAttribute("aria-label") || text(b)
        )
      }))
    };
  }

  function guard() {
    if (stopped) throw Error("Stopped by user.");

    if (!/(^|\.)linkedin\.com$/.test(location.hostname)) {
      throw Error("Not LinkedIn.");
    }

    if (/checkpoint|challenge|authwall|login/i.test(location.pathname)) {
      throw Error("Login/security challenge.");
    }

    const warning =
      /weekly invitation limit|invitation limit reached|too many invitations|account.*restricted|verify your identity|verify you are human|security verification|something went wrong|try again later/i;

    if (
      all('[role="alert"],[role="dialog"],dialog')
        .filter(visible)
        .some(e => warning.test(text(e)))
    ) {
      throw Error("Restriction, challenge, or error detected; stopping.");
    }
  }

  async function wait(ms) {
    const end = Date.now() + ms;

    while (Date.now() < end) {
      guard();
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    guard();
  }

  async function until(fn, message, timeout = 15000) {
    const end = Date.now() + timeout;

    while (Date.now() < end) {
      guard();

      const value = fn();
      if (value) return value;

      await wait(300);
    }

    throw Error(`Timed out: ${message}. No automatic retry.`);
  }

  function candidates() {
    const map = new Map();

    for (const e of all(CONNECT).filter(
      e => visible(e) && enabled(e)
    )) {
      const id = new URL(e.href, location.href)
        .searchParams.get("vanityName");

      if (id) {
        map.set(id, {
          id,
          name: e.getAttribute("aria-label"),
          element: e
        });
      }
    }

    return [...map.values()];
  }

  function pending(id) {
    const link = all('main [role="listitem"] a[href]').find(e => {
      try {
        return new URL(e.href, location.href)
          .pathname.replace(/\/$/, "") === `/in/${id}`;
      } catch {
        return false;
      }
    });

    const card = link?.closest('[role="listitem"]');

    return !!card &&
      [...card.querySelectorAll('button,a,[role="button"]')]
        .some(e => visible(e) && /^Pending$/i.test(text(e)));
  }

  function scan() {
    const rows = candidates().map(({ id, name }) => ({
      id,
      name,
      attempted: tried.has(id)
    }));

    console.table(rows);
    log("SCAN", diagnostics());

    return rows;
  }

  async function sendDialog(id) {
    stage = "dialog";
    guard();

    const ds = dialogs().filter(
      d => d.matches(".send-invite") ||
        d.querySelector("#send-invite-modal")
    );

    if (ds.length !== 1) {
      throw Error("Expected one invitation dialog; inspect diagnostics.");
    }

    const sendButtons = buttons(ds[0]).filter(b =>
      enabled(b) &&
      (
        b.getAttribute("aria-label") === "Send without a note" ||
        text(b) === "Send without a note"
      )
    );

    if (sendButtons.length !== 1) {
      throw Error("Expected one enabled Send without a note button.");
    }

    log("DIALOG_FOUND", {
      text: text(ds[0]).slice(0, 500)
    });

    guard();
    stage = "send";

    log("CLICK_SEND_WITHOUT_NOTE", { id });
    sendButtons[0].click();

    stage = "verify";

    if (id) {
      await until(
        () => pending(id),
        "recipient Pending state"
      );

      log("CONFIRMED_PENDING", { id });
    } else {
      await until(
        () => !visible(ds[0]),
        "invitation dialog to close"
      );

      log("DIALOG_CLOSED", {
        message:
          "Send clicked; recipient Pending state was not verified. Check the card."
      });
    }
  }

  async function execute(work) {
    if (running) {
      log("ALREADY_RUNNING");
      return;
    }

    running = true;
    stopped = false;

    try {
      guard();
      await work();
    } catch (e) {
      log("STOPPED_ON_ERROR", {
        message: e.message,
        diagnostics: diagnostics()
      }, true);
    } finally {
      running = false;
      stage = "idle";
    }
  }

  async function finishOpenInvitation() {
    return execute(async () => {
      // Finish only the existing invitation, without clicking Connect.
      const matching = dialogs().filter(
        d => d.matches(".send-invite") ||
          d.querySelector("#send-invite-modal")
      );

      if (matching.length !== 1) {
        throw Error("Expected one open invitation dialog.");
      }

      const recipient = text(
        matching[0].querySelector("strong")
      );

      const match = candidates().filter(
        c => c.name === `Invite ${recipient} to connect`
      );

      const id = match.length === 1 ? match[0].id : null;

      if (id) tried.add(id);

      await sendDialog(id);
    });
  }

  async function run({
    dryRun = true,
    maxRequests = 1,
    maxPages = 1
  } = {}) {
    if (
      typeof dryRun !== "boolean" ||
      !Number.isInteger(maxRequests) ||
      maxRequests < 1 ||
      !Number.isInteger(maxPages) ||
      maxPages < 1
    ) {
      throw Error("Use boolean dryRun and positive integer limits.");
    }

    return execute(async () => {
      stage = "start";
      log("RUN_START", { dryRun, maxRequests, maxPages });

      if (dryRun) {
        scan();
        return;
      }

      let count = 0;

      for (let page = 1; page <= maxPages; page++) {
        if (dialogs().length) {
          throw Error(
            "An invitation is already open. Use finishOpenInvitation() " +
            "or close it manually."
          );
        }

        for (const c of candidates().filter(c => !tried.has(c.id))) {
          if (count >= maxRequests) break;

          guard();
          stage = "connect";

          const live = candidates().find(x => x.id === c.id);

          if (!live) throw Error("Candidate disappeared.");

          tried.add(c.id);
          count++;

          log("CLICK_CONNECT", { id: c.id });
          live.element.click();

          const state = await until(
            () =>
              pending(c.id)
                ? "pending"
                : dialogs().length
                  ? "dialog"
                  : false,
            "dialog or Pending state"
          );

          if (state === "dialog") {
            await sendDialog(c.id);
          } else {
            log("CONFIRMED_PENDING", { id: c.id });
          }

          await wait(4000);
        }

        if (count >= maxRequests || page === maxPages) break;

        stage = "pagination";
        guard();

        const next = all(NEXT).find(
          e => visible(e) && enabled(e)
        );

        if (!next) break;

        const signature = () =>
          all('main [role="listitem"] a[href*="/in/"]')
            .map(e => e.href)
            .join("|");

        const before = signature();

        log("CLICK_NEXT");
        next.click();

        await until(
          () => signature() && signature() !== before,
          "new result cards"
        );

        await wait(1500);
      }

      log("COMPLETE", { attemptedThisRun: count });
    });
  }

  window.liConnect = {
    version: "1.1.0",
    scan,
    run,
    finishOpenInvitation,

    isRunning: () => running,

    stop() {
      stopped = true;
      log("STOP_REQUESTED");
    },

    report() {
      return JSON.stringify({
        version: this.version,
        running,
        attempted: [...tried],
        diagnostics: diagnostics(),
        logs
      }, null, 2);
    }
  };

  log("INSTALLED", {
    message: "Shadow-root support enabled. No invitations sent."
  });

  scan();
})();
