// Enter confirms an input/textarea; Shift+Enter is left alone so it still
// inserts a line break in a textarea (free-text fields). Wrap a form's submit
// handler and hang the result on the field's onKeyDown. Fires only on a plain
// Enter with no Shift and no in-progress IME composition (so committing a
// candidate word with Enter doesn't also submit the form).
export function submitOnEnter(handler) {
  return (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent?.isComposing) return;
    e.preventDefault();
    handler(e);
  };
}
