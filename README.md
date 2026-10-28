# LinkedIn Connect Debugger

A browser-console script that sends LinkedIn connection requests from People search results, with diagnostic logging, shadow DOM support, and automatic pagination.

> **Disclaimer:** LinkedIn prohibits unauthorized automation. Using this script may result in account restrictions. This project is unofficial, is not affiliated with LinkedIn, and provides no guarantee against detection or restrictions.

## Features

- Detects Connect links on People search results.
- Sends invitations **without a note**.
- Searches open shadow roots and retains an inspected shadow root for invitation dialogs.
- Processes multiple profiles and pages in one run.
- Skips profiles already attempted during the current session.
- Checks for a recipient’s **Pending** state before confirming success.
- Logs connection clicks, dialog handling, verification, pagination, and errors.
- Stops on unexpected dialogs, timeouts, and recognized restriction messages.
- Includes a dry-run mode that performs no clicks.

## Requirements

- A desktop browser with developer tools, such as Chrome or Edge.
- A signed-in LinkedIn session.
- A LinkedIn **People search results** page.
- The [`linkedin-connect-debug.js`](./linkedin-connect-debug.js) script.

## Installation

1. Open LinkedIn and search for the people you want to connect with.
2. Select **People** and apply your desired filters.
3. Open your browser’s developer tools:
   - **Windows/Linux:** `Ctrl + Shift + J`
   - **macOS:** `Cmd + Option + J`
4. Open `linkedin-connect-debug.js` and copy its entire contents.
5. Paste the script into the **Console** and execute it.

Installation scans the page and displays candidates. **It does not send invitations.**

Review any code before running it in your signed-in browser.

### Shadow DOM setup

Some LinkedIn invitation dialogs appear inside a shadow root.

If the script cannot find an invitation dialog:

1. Leave the dialog open.
2. Right-click **Send without a note** and select **Inspect**.
3. Keep that button selected in the Elements panel.
4. Return to the Console and paste the script again without refreshing.

The script uses DevTools’ `$0` reference to retain the selected button’s shadow root, including a closed root.

To send the invitation that is already open:

```javascript
await liConnect.finishOpenInvitation()
```

This acts on the existing invitation dialog without clicking another Connect link.

## Usage

### Preview candidates

```javascript
liConnect.scan()
```

Displays detected profiles and whether each has already been attempted.

### Dry run

```javascript
await liConnect.run({
  dryRun: true
})
```

Scans and logs the current page without clicking anything.

### Send one invitation

```javascript
await liConnect.run({
  dryRun: false,
  maxRequests: 1
})
```

### Run an automatic batch

```javascript
await liConnect.run({
  dryRun: false,
  maxRequests: 20,
  maxPages: 10
})
```

The script processes candidates sequentially and advances using the Next button.

It stops when it reaches any of the following:

- The total attempt limit.
- The page limit.
- No available Next button.
- An unexpected dialog, timeout, or recognized restriction.
- A manual stop request.

`maxRequests` applies to the entire run, not each page. The example above allows up to **20 total attempts across at most 10 pages**.

Batch limits are operational limits, not guarantees against account restrictions.

### Stop

```javascript
liConnect.stop()
```

Stops future actions. It cannot undo a request that has already been submitted.

### Check whether a run is active

```javascript
liConnect.isRunning()
```

### Export diagnostic logs

```javascript
copy(liConnect.report())
```

Copies a JSON report to your clipboard using the DevTools `copy()` helper.

Alternatively, display the report:

```javascript
console.log(liConnect.report())
```

Review reports before sharing: they may contain recipient names, profile identifiers, and dialog text.

## Configuration

Pass these options to `liConnect.run()`:

| Option | Default | Description |
| --- | --- | --- |
| `dryRun` | `true` | Inspect the current page without performing clicks. |
| `maxRequests` | `1` | Maximum connection attempts across the entire run. |
| `maxPages` | `1` | Maximum pages processed, including the starting page. |

`maxRequests` and `maxPages` must be positive integers.

The script waits four seconds after processing each invitation to allow interface updates. This delay is not a bot-detection bypass.

## Console Events

| Event | Meaning |
| --- | --- |
| `INSTALLED` | Script loaded; no invitations sent by installation. |
| `SCAN` | Candidate and dialog diagnostics collected. |
| `RUN_START` | A run started with the displayed configuration. |
| `CLICK_CONNECT` | A profile’s Connect link was clicked. |
| `DIALOG_FOUND` | An invitation dialog was located. |
| `CLICK_SEND_WITHOUT_NOTE` | The send button was clicked. |
| `CONFIRMED_PENDING` | The recipient’s card displayed Pending. |
| `DIALOG_CLOSED` | The dialog closed, but recipient Pending status was not verified. |
| `CLICK_NEXT` | The next-page button was clicked. |
| `COMPLETE` | The batch finished; includes its attempt count. |
| `ALREADY_RUNNING` | A second run was requested while one was active. |
| `STOP_REQUESTED` | A manual stop was requested. |
| `STOPPED_ON_ERROR` | Execution stopped with diagnostic information. |

**A click is not proof of a successful invitation.** Look for `CONFIRMED_PENDING`.

## Troubleshooting

### It sends one invitation and stops

The default `maxRequests` is `1`. Increase it for a batch:

```javascript
await liConnect.run({
  dryRun: false,
  maxRequests: 20,
  maxPages: 10
})
```

### It does not advance to the next page

Check that:

- `maxPages` is greater than `1`.
- The run has not reached `maxRequests`.
- An enabled Next button exists.
- No error or invitation dialog interrupted execution.

The script processes the current page before advancing.

### The invitation dialog opens, but nothing happens

The dialog may be inside a shadow root the script cannot access.

Inspect **Send without a note**, reinstall the script while the button remains selected, then run:

```javascript
await liConnect.finishOpenInvitation()
```

If LinkedIn replaces a closed shadow root, repeat this inspection step.

### It times out waiting for Pending

The invitation may have been submitted even if the script could not verify the updated card.

Check the page manually before retrying. The script remembers the attempted profile to avoid automatically repeating an ambiguous action.

### A profile is marked as already attempted

Profiles are marked before clicking Connect. Failed or uncertain attempts remain marked during the session.

Refreshing clears this tracking, so verify any uncertain invitations before starting again.

### No Connect links are found

Confirm that you are on a People search results page containing visible Connect links.

Follow, Message, and Pending controls are not treated as Connect links. LinkedIn interface changes may also require selector updates.

### LinkedIn displays a restriction or verification challenge

Stop using the script and address the message through LinkedIn. The script does not bypass verification, invitation limits, or account restrictions.

## Limitations

- Built around a specific LinkedIn People search interface; interface changes can break it.
- Live compatibility is not guaranteed.
- Sends without notes; personalized messages are not supported.
- Does not search profile menus for hidden Connect actions.
- Does not automatically access arbitrary closed shadow roots or cross-origin frames.
- Recognized warning checks are not exhaustive.
- Tracking and logs are held in memory and are lost on refresh.
- No automatic retries after uncertain outcomes.
- No stealth, CAPTCHA bypass, or bot-detection evasion.

## Reporting Problems

Include:

1. The command you ran.
2. The last logged event or error.
3. A redacted report from `liConnect.report()`.
4. Relevant button or dialog HTML if the interface changed.

Do not include cookies, passwords, session tokens, or authorization headers.
