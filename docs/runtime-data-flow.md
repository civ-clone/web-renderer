# Runtime Data Flow

## End-to-end turn flow

1. Frontend starts and waits for user to pick game mode/options.
2. Frontend sends `setOptions` then `start`.
3. Worker starts engine and creates clients.
4. Human client (`DataTransferClient`) sends initial `gameData` snapshot once turn handling begins.
5. Frontend stores raw object map and runs `reconstituteData` to rebuild graph references.
6. As game changes occur, backend queues patches in `DataQueue` and emits `gameDataPatch`.
7. Frontend mutates local object map from patches, reconstitutes, and re-renders affected views.
8. Player input sends `action` messages; backend applies action and emits next patches.

## Transport details

### Worker/main-thread transports

- `ParentTransport` (worker side)
  - Uses global `postMessage`/`addEventListener('message')`.
- `WorkerTransport` (frontend side)
  - Uses `Worker.postMessage` and worker event listeners.
  - Reconstitutes incoming hierarchy payloads before handing to caller.

Both transport implementations normalize `DataObject` instances by converting to plain objects before send.

## Initial snapshot vs patch stream

### Initial snapshot (`gameData`)

- Sent from `DataTransferClient.sendInitialData()`.
- Includes a `TransferObject` rooted at key entities (player, turn, year).
- Frontend treats this as full state bootstrap.

### Incremental patching (`gameDataPatch`)

`DataQueue` patch shape (each entry in the `gameDataPatch` array):
- `targetId`: object ID key of the patched root object.
- `type`: `add | update | remove`
- `index`: nested object path string (`foo.bar[3]` style) or `null`
- `value`: payload with `{ hierarchy, objects }` (functions are resolved before send)

Frontend patch handling in `Renderer`:

- `add/update`
  - If `index` exists, set nested path inside target object.
  - Else replace root object entry.
  - Merge any `value.objects` references into object map.
- `remove`
  - Remove nested path or root object.

## Event bridge inside frontend

- `patchdatareceived` is dispatched for each applied patch payload.
- `dataupdated` is dispatched after state reconstitution.
- `DataObserver` subscribes by object IDs and triggers callbacks when observed IDs were touched.

## Choice/interaction flow

When backend needs user choice (`chooseFromList`):

1. Worker sends choice metadata (`choices`, `key`, contextual `data`).
2. Frontend opens `SelectionWindow` or `ActionWindow` (for some negotiation cases).
3. User selection sends chosen ID over `chooseFromList` channel.
4. Worker resolves pending `chooseFromList()` promise and continues turn logic.

## Notifications

- Low-level textual notifications use `notification` channel.
- Rich game notifications use `gameNotification` channel with typed data consumed by `Notifications` UI.

## Known data-flow pain points

- `Renderer` notes expensive reconstitution in late game and TODOs around worker-thread offload.
- Patch application relies on manual string-path mutation logic.
- Cleanup of orphaned objects is commented out due performance concerns.

