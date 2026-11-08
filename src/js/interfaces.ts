// The interfaces civ.one offers (#825): each registers itself and provides what it uses. `DEFAULT_INTERFACE`
//  (`lib/interfaceMode.ts`) must be one of them, and the order is the order Options lists them in. Nothing else imports
//  an interface, and a test holds both.
import '@civ-clone/ui-interface-modern';
import '@civ-clone/ui-interface-classic';
