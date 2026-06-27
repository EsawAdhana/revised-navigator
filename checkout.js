// checkout.js
// A tiny, intentionally buggy checkout module used to exercise the full
// Human Behavior loop with a REAL stack trace:
//   crash (here) -> SDK -> issue -> issue.created -> agent -> grounded PR
//
// IMPORTANT: commit this exact file into the GitHub repo your agent is
// connected to. The crash's stack trace points at `renderCartSummary` in
// `checkout.js`, so the agent can locate this source and open a real fix PR
// (instead of just a tracking issue).

function renderCartSummary(cart) {
  let total = 0;
  for (let i = 0; i < cart.items.length; i++) {
    const item = cart.items[i];
    // A line item can be undefined when it fails to resolve
    // (e.g. an out-of-stock product or a stale cart entry). Reading `.price`
    // on undefined throws:
    //   TypeError: Cannot read properties of undefined (reading 'price')
    // FIX: skip unresolved line items instead of dereferencing undefined.
    if (!item) continue;
    total += item.price * item.quantity;
  }
  return total;
}

function checkout() {
  const cart = {
    items: [
      { name: 'Keyboard', price: 79.0, quantity: 1 },
      undefined, // unresolved / out-of-stock line item -> previously triggered the crash
      { name: 'Mouse', price: 25.0, quantity: 2 },
    ],
  };
  const total = renderCartSummary(cart);
  return total;
}
