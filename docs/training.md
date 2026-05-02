# Training Mechanics & Paradigms (Design Spec)

> **Status:** Updated spec based on separation of Personal Training and System Familiarity.

## 1. Separation of Personal & Team Training
We are splitting training benefits into two strict columns to avoid overpowered (OP) attribute farming:
- **Individual Attributes (K2 stats):** These are ONLY progressed through **Personal Training / Individual Focus**.
- **System Familiarity (Offensive/Defensive Sets):** These are ONLY progressed through **Team Daily Training Paradigms** (e.g., Heavy Offense, Heavy Defense).

## 2. Daily Team Training Paradigms (System Familiarity)
Daily team training sessions no longer directly increase a player's individual OIQ (Offensive IQ) or DIQ (Defensive IQ) attributes. Instead, they build **System Familiarity**.
- **Heavy Offense:** Quickly builds Offensive System Familiarity.
- **Heavy Defense:** Quickly builds Defensive System Familiarity.
- **Balanced (Default):** Builds both linearly, but at a marginally lower rate than focused training.
- **Impact of Familiarity:** High familiarity acts as an "Aura" or multiplier in simulation, improving overall team strength, execution, and synergy without artificially inflating individual K2 player ratings.
- **Trade Penalty (The "Clean Slate"):** If a player is traded or the team fires its head coach (changing the system), the player's System Familiarity drops to **0**. They must re-learn the new playbook from scratch. Familiarity is tied to the *current team's specific system*, not the player's core basketball knowledge.

## 3. Handling Biometrics / Athletic Heavy Training
To prevent users from farming "Biometric Heavy" training and turning slow centers into Olympic sprinters, athletic progression is heavily gated:

*   **The Genetic Ceiling:** Physical attributes (Speed, Vertical, Strength) have strict, hidden genetic limitations per player. You cannot train past this ceiling.
*   **Wear-and-Tear (Injury Risk):** Heavy biometric training massively spikes fatigue and injury probability. Spamming this training will result in torn ligaments rather than increased speed.
*   **Age Decay Curve:** 
    *   *U-23:* Can increase strength/stamina; slight improvements to agility.
    *   *Prime (24-28):* Biometrics shift to pure **maintenance**. You can no longer increase physical stats, only prevent them from dropping.
    *   *Veterans (29+):* Heavy biometric training actually accelerates physical decline due to joint degradation. Vets require "Recovery" or "Low Intensity" training instead.
*   **Zero-Sum Focus:** Time spent lifting weights is time not spent shooting. Over-indexing on Biometrics will cause skill attributes (Shooting, Playmaking) to stagnate or regress.
