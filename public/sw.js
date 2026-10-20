// Voxi service worker: shows reminder notifications and handles Done / Snooze.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Voxi", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Voxi";

  const show = self.registration.showNotification(title, {
    body: data.body || "",
    tag: data.tag,
    renotify: Boolean(data.tag),
    requireInteraction: true,
    icon: "/icon",
    badge: "/icon",
    data,
    actions: data.reminderId
      ? [
          { action: "done", title: "Done" },
          { action: "snooze", title: "Snooze 10 min" },
        ]
      : [],
  });

  // Let open tabs speak it too.
  const tell = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => clients.forEach((c) => c.postMessage({ type: "reminder", title, body: data.body })));

  event.waitUntil(Promise.all([show, tell]));
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  const post = (path, body) =>
    fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

  let work;
  if (event.action === "snooze" && data.reminderId) {
    work = post(`/api/reminders/${data.reminderId}/snooze`, { minutes: 10 });
  } else if (event.action === "done" && data.reminderId) {
    work = post(`/api/reminders/${data.reminderId}/done`);
  } else {
    work = self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => new URL(c.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow("/");
    });
  }
  event.waitUntil(work);
});
