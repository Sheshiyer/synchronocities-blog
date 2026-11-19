# An Interface Should Leave Room for Correction

A system can remember a user accurately and still answer the wrong present.

Imagine an assistant that remembers a preference for early meetings. A new request arrives: “Find a time after lunch.” The assistant treats the saved preference as more authoritative than the current sentence and offers 8 a.m.

This is a hypothetical design failure. No product incident is being reported. The example makes a distinction visible: remembering what someone usually wants is different from deciding what their current request permits.

A useful interface needs a place where that distinction can be corrected before it becomes an external act.

## Three different jobs

In *The Lighted Clearing*, I distinguish source, working memory and witness. As a contemporary design reading, the distinction can ask practical questions of an assistant.

The **source** is the actual request and the commitments relevant to it. Keep the current words accessible. If a request is paraphrased, retain the path back to what was said.

**Working memory** supplies summaries, earlier preferences and provisional plans. Those can help an assistant interpret a request. They should carry their conditions: who supplied the information, when it applied and whether the present request changes it.

The **witness** judges what can happen now. For a consequential action, someone must remain able to inspect, correct or stop the proposal. Merely displaying a summary does not establish that anyone approved the act.

These are design responsibilities, not three magical boxes that make a system trustworthy by themselves. The implementation still has to preserve the distinction when information moves between components.

## Show the assumption where it matters

A generic “Are you sure?” button can conceal the very interpretation that needs correction.

A more useful proposal in the meeting example would say: “I found three slots after lunch, following your current request. Your saved preference usually favors mornings.”

The conflict is visible. The user can decide whether the saved preference should remain, be narrowed or change. The system has not silently converted an older pattern into a standing instruction.

Now imagine the request was “Find a convenient time.” There is more ambiguity. The morning preference can reasonably help generate options. It still does not automatically authorize sending invitations.

The interface should distinguish finding, proposing and committing. What the assistant can infer at one stage may be insufficient authority for the next.

## A revision window before commitment

I call the interval before an interpretation becomes an external act a **revision window**. This is a proposed design term. It gives correction a location in the flow.

Ask three questions at that location:

- What words or commitments support the proposal?
- Which part was inferred from an earlier pattern?
- What will happen if this proposal is accepted?

Not every action needs a blocking dialog. Adding a reversible local suggestion has different consequences from sending a message to another person. The window can be a preview, an editable assumption, a pause at a boundary or a clear route to undo. Its form should fit the act.

It also needs to reach the action itself. A user correcting the preview is of little use if the execution layer still follows the old plan.

## Keep correction from becoming ceremony

More prompts can make a flow exhausting. A system that asks for confirmation at every trivial step may teach people to approve without reading.

The design problem is therefore not to maximize interruptions. It is to preserve the distinctions that can change a consequential decision and make them legible at the moment they matter.

Test the flow with an actual conflicting request: does the new sentence change the proposal? Does the correction survive into execution? Can the user tell what has already happened?

An interface should make the present capable of revising the remembered pattern.

The fuller philosophical argument is in my essay [The Lighted Clearing](https://synchronocities.tryambakam.space/posts/lighted-clearing-loka-akshara-dhi/), part of Synchronocities and Tryambakam Noesis. This companion applies its distinction to an interface; it makes no claim that a deployed product already implements the design.
