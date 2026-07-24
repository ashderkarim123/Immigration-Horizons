import { contact, whatsappLink } from "@/lib/content/site";

/**
 * Persistent WhatsApp entry point. Carried over from the legacy site, where
 * it is a primary contact route for clients in other time zones.
 */
export function WhatsAppFab() {
  return (
    <a
      href={whatsappLink(contact.whatsappPrimary)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="shadow-lifted fixed right-5 bottom-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white transition-transform duration-200 ease-(--ease-out-soft) motion-safe:hover:scale-105"
    >
      <svg viewBox="0 0 32 32" width="28" height="28" fill="currentColor" aria-hidden>
        <path d="M16.02 3C9.4 3 4 8.38 4 15c0 2.34.68 4.52 1.86 6.36L4 29l7.86-1.83A11.9 11.9 0 0 0 16.02 27C22.65 27 28 21.62 28 15S22.65 3 16.02 3zm0 21.6c-1.98 0-3.83-.55-5.4-1.5l-.39-.23-4.66 1.09 1.12-4.53-.25-.4A9.55 9.55 0 0 1 5.4 15c0-5.85 4.77-10.6 10.62-10.6S26.6 9.15 26.6 15 21.87 24.6 16.02 24.6zm5.83-7.94c-.32-.16-1.9-.94-2.2-1.05-.3-.11-.51-.16-.73.16-.21.32-.84 1.05-1.03 1.26-.19.21-.38.24-.7.08-.32-.16-1.34-.5-2.56-1.6-.95-.85-1.58-1.9-1.77-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.38.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.73-1.77-1-2.42-.26-.63-.53-.54-.73-.55-.19-.01-.4-.01-.62-.01-.21 0-.56.08-.85.4-.29.32-1.12 1.1-1.12 2.67 0 1.57 1.15 3.09 1.31 3.3.16.21 2.26 3.45 5.48 4.84.77.33 1.37.53 1.83.68.77.24 1.47.21 2.02.13.62-.09 1.9-.78 2.17-1.53.27-.75.27-1.39.19-1.53-.08-.13-.29-.21-.61-.37z" />
      </svg>
    </a>
  );
}
