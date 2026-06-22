import { useRef, useEffect } from 'react';

// Lightweight contentEditable HTML editor. Outputs HTML stored in the blog's
// content_en / content_hi columns and rendered by the customer app's
// react-native-render-html. No external editor dependency.
export default function RichText({ value, onChange, placeholder }) {
  const ref = useRef(null);

  // Sync external value in only when it differs (avoids clobbering the caret on type).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (cmd, arg) => {
    document.execCommand(cmd, false, arg);
    ref.current?.focus();
    onChange(ref.current?.innerHTML || '');
  };

  const addLink = () => {
    const url = window.prompt('Link URL:');
    if (url) exec('createLink', url);
  };

  return (
    <div>
      <div className="rte-toolbar">
        <button type="button" onClick={() => exec('bold')}><b>B</b></button>
        <button type="button" onClick={() => exec('italic')}><i>I</i></button>
        <button type="button" onClick={() => exec('formatBlock', 'H2')}>H2</button>
        <button type="button" onClick={() => exec('formatBlock', 'H3')}>H3</button>
        <button type="button" onClick={() => exec('formatBlock', 'P')}>P</button>
        <button type="button" onClick={() => exec('insertUnorderedList')}>• List</button>
        <button type="button" onClick={addLink}>Link</button>
        <button type="button" onClick={() => exec('removeFormat')}>Clear</button>
      </div>
      <div
        ref={ref}
        className="rte-editor"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
      />
    </div>
  );
}
