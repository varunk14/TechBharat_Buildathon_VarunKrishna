// The side panel is a full extension page. It owns all UI, all state, and all
// model API calls including streaming. Model requests originate here, not in the
// service worker, so a fetch response can stream directly into the DOM. See D4.

// MVP 0 scaffold: the panel is built in MVP 1 onward.
