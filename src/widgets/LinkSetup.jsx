import { useState } from 'react'

// The empty state for widgets that need a link: a short explanation, steps
// for finding the link, and a paste box. `check` returns { ok, error }.
export default function LinkSetup({ heading, steps, placeholder, check, onSave, extra }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  function save(event) {
    event.preventDefault()
    const result = check(text)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError('')
    onSave(result)
  }

  return (
    <div className="link-setup">
      {heading && <p className="link-setup-heading">{heading}</p>}
      {steps && (
        <ol className="link-setup-steps">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      <form className="inline-form" onSubmit={save}>
        <input
          type="text"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setError('')
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-invalid={!!error}
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="primary" disabled={!text.trim()}>
          Save
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {extra}
    </div>
  )
}
