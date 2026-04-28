# Resource-Oriented Features voor Control Flow Studio

## Overzicht
Voeg een "Resources" sectie toe aan de sidebar met toggles en filters die resource-gerelateerde inzichten visueel maken op de process map (zowel DFG als BPMN).

## Feature 1: Resource Overlays (toggle-knoppen)

Drie snelle toggle-knoppen in een nieuwe **"RESOURCE INSIGHTS"** sidebar sectie:

### 1a. Bottleneck Highlight
- Toggle die bottleneck-activiteiten markeert met een rode pulserende glow/border
- Bottleneck = hoge wachttijd + dominante resource (>80% door 1 agent)
- Toont een waarschuwingsicoon (⚠) op de activiteit

### 1b. Single Resource Risk (Bus Factor)
- Toggle die activiteiten markeert die door slechts 1 agent worden uitgevoerd
- Oranje border + 👤 icoon
- Risico-indicator: als die agent wegvalt, stopt het proces

### 1c. Handoff Hotspots
- Toggle die edges kleurt op basis van handoff-rate
- Groen = zelfde resource (0% handoff), Rood = altijd andere resource (100% handoff)
- Dikkere lijn = meer handoffs
- Werkt in zowel DFG als BPMN

## Feature 2: Resource Balance Meter

Per activiteit een kleine **badge** die toont:
- Aantal unieke agents (bijv. "3👤")
- Kleur: rood (1 agent) → oranje (2) → groen (3+)
- Altijd zichtbaar wanneer "Resource" view mode actief is, of als de Resource Insights sectie open is
- In BPMN: kleine badge rechtsonder op de activity box

## Feature 3: Workload Distribution Filter

Een **"Min. Resources"** slider (1-10) in de sidebar:
- Filtert activiteiten die door minder dan N agents worden uitgevoerd
- Handig om snel te zien welke activiteiten breed genoeg bemand zijn
- Activiteiten onder de threshold worden gedempt (opacity 0.3) maar niet verborgen

## Feature 4: Handoff Analysis Mini-Panel

Onder de Resource Insights toggles, een opvouwbaar **"Top Handoffs"** paneel:
- Toont top 5 meest voorkomende resource-wisselingen (agent A → agent B)
- Met frequentie en percentage
- Click op een handoff → highlight die edge op de map
- Geeft inzicht in welke overdrachten het vaakst voorkomen

## Feature 5: Resource View Mode voor BPMN

Momenteel is de view mode toggle (Frequency/Performance/Resource) verborgen in BPMN.
- Maak Resource view ook beschikbaar in BPMN
- In BPMN Resource view: activity borders kleuren op basis van agent-diversiteit (zelfde kleurschema als DFG)
- Edges krijgen handoff-rate kleuring

## Implementatie

### Bestanden die gewijzigd worden:
1. **ControlFlowStudio.vue** - Sidebar sectie "RESOURCE INSIGHTS" met toggles, slider, en handoff panel
2. **useProcessMap.js** - Reactive state voor resource overlays, computed properties voor filtered data
3. **theme.css** - CSS voor bottleneck glow, risk borders, badges, handoff kleuring

### Sidebar Layout (onder bestaande LEGEND sectie):
```
RESOURCE INSIGHTS
[toggle] Bottlenecks        (2)
[toggle] Single Resource ⚠  (4)
[toggle] Handoff Hotspots

Min. Resources  [===|====] 1

▼ Top Handoffs
  Agent12 → Agent5    34x (12%)
  Agent3 → Agent8     28x (10%)
  Agent1 → Agent12    21x (7%)
  ...
```

### Geen breaking changes:
- Alle features zijn opt-in toggles
- Default state: alles uit
- Bestaande Frequency/Performance/Resource views blijven ongewijzigd
