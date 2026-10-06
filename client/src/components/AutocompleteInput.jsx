import { useEffect, useRef, useState } from 'react';

export default function AutocompleteInput({
  value,
  onChange,
  placeholder = '',
  className = '',
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);
  const containerRef = useRef(null);

  // Debounce de 300 ms
  useEffect(() => {
    const text = value.trim();
    if (!text) {
      setSuggestions([]);
      setShow(false);
      return undefined;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const params = new URLSearchParams({ text, limit: '5' });
        const response = await fetch(`/api/geocode/suggest?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Error en sugerencias');
        const data = await response.json();
        setSuggestions(data.results || []);
        setShow(true);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setSuggestions([]);
          setShow(false);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [value]);

  // Cierra el desplegable al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShow(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(suggestion) {
    onChange(suggestion.label);
    setSuggestions([]);
    setShow(false);
  }

  return (
    <div className="autocomplete" ref={containerRef}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => value.trim() && suggestions.length > 0 && setShow(true)}
      />
      {show && suggestions.length > 0 && (
        <ul className="autocomplete__list">
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.label}-${index}`}>
              <button
                type="button"
                onClick={() => handleSelect(suggestion)}
                className="autocomplete__option"
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {show && loading && <p className="autocomplete__loading">Buscando…</p>}
    </div>
  );
}
