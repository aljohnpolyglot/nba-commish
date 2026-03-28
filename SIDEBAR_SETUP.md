# Sidebar Integration Guide

This guide explains how to add new views/tabs to the application sidebar and main content area.

## 3-Step Process to Add a New Sidebar Item

### Step 1: Update the Tab Type (`src/types.ts`)

Add your new view name to the `Tab` type union:

```typescript
export type Tab = 'Inbox' | 'Messages' | ... | 'Your New View';
```

**Example:**
```typescript
export type Tab = 'Inbox' | 'Messages' | 'Social Feed' | ... | 'Trade Machine' | 'Your New View';
```

---

### Step 2: Add Navigation Menu Item (`src/components/sidebar/NavigationMenu.tsx`)

#### 2a. Import the Icon
Add your icon from `lucide-react` at the top of the file:

```typescript
import {
  Inbox, MessageSquare, Newspaper, Activity, Trophy, Sparkles,
  // ... other icons ...
  YourIcon, // ← Add your icon here
} from 'lucide-react';
```

#### 2b. Add Menu Item to Group
Add your item to one of the `NavGroup` arrays in the `groups` constant:

```typescript
const groups: NavGroup[] = [
  {
    label: 'League',
    items: [
      { id: 'NBA Central', label: 'NBA Central', icon: Trophy },
      { id: 'Standings', label: 'Standings', icon: Table2 },
      { id: 'Transactions', label: 'Transactions', icon: ArrowRightLeft },
      { id: 'Your New View', label: 'Your New View', icon: YourIcon }, // ← Add here
      { id: 'Players', label: 'Players', icon: Search },
    ],
  },
  // ... other groups ...
];
```

**Available Groups:**
- `Command Center`
- `Communications`
- `League`
- `Analytics`
- `Draft`
- `Operations`
- `Personal`

**Icon Sources:** Browse [lucide-react icons](https://lucide.dev)

---

### Step 3: Wire Up the View (`src/components/layout/MainContent.tsx`)

#### 3a. Import Your View Component
At the top of the file:

```typescript
import { YourNewView } from '../path/to/YourNewView';
```

**Example:**
```typescript
import { TradeMachineView } from '../central/view/TradeMachineView';
```

#### 3b. Add Case to Switch Statement
Add your view case in the switch statement:

```typescript
export const MainContent: React.FC<MainContentProps> = ({ currentView }) => {
  switch (currentView) {
    // ... other cases ...
    case 'Your New View':
      return <YourNewView />;
    case 'Next Case':
      return <NextCase />;
    // ... rest of cases ...
  }
};
```

---

## Example: Adding "Trade Machine"

### Step 1: Update types.ts
```typescript
// Before
export type Tab = '...' | 'Transactions';

// After
export type Tab = '...' | 'Transactions' | 'Trade Machine';
```

### Step 2: Update NavigationMenu.tsx
```typescript
// Import icon
import { ..., Cpu } from 'lucide-react';

// Add to League group
{
  label: 'League',
  items: [
    { id: 'NBA Central', label: 'NBA Central', icon: Trophy },
    { id: 'Standings', label: 'Standings', icon: Table2 },
    { id: 'Transactions', label: 'Transactions', icon: ArrowRightLeft },
    { id: 'Trade Machine', label: 'Trade Machine', icon: Cpu }, // ← Added
    { id: 'Players', label: 'Players', icon: Search },
  ],
}
```

### Step 3: Update MainContent.tsx
```typescript
// Import
import { TradeMachineView } from '../central/view/TradeMachineView';

// Add case
case 'Trade Machine':
  return <TradeMachineView />;
```

---

## File Checklist

When adding a new sidebar item, modify these files in order:

- [ ] `src/types.ts` — Add to `Tab` type
- [ ] `src/components/sidebar/NavigationMenu.tsx` — Add menu item
- [ ] `src/components/layout/MainContent.tsx` — Import view & add case

---

## Tips

1. **Keep labels consistent** - The `id` in NavigationMenu must exactly match the `Tab` type
2. **Icon placement** - Menu items appear in the order they're defined in the `items` array
3. **Grouping** - Place related items in the same `NavGroup`
4. **Badges** - Add `badge: badgeValue` to show notification counts:
   ```typescript
   { id: 'Messages', label: 'Messages', icon: MessageSquare, badge: 5 }
   ```
5. **Lazy loading** - Views can be lazy-loaded for performance if needed

---

## Common Lucide Icons

| Icon | Name | Use Case |
|------|------|----------|
| `Cpu` | Cpu | Tools, Trade Machine |
| `ArrowRightLeft` | ArrowRightLeft | Transactions, Trades |
| `Search` | Search | Player Search, Browsing |
| `Trophy` | Trophy | League, Awards, Playoffs |
| `BarChart2` | BarChart2 | Statistics, Analytics |
| `Users` | Users | Teams, Players |
| `DollarSign` | DollarSign | Finances, Salary Cap |
| `Calendar` | Calendar | Schedule, Events |
| `Settings2` | Settings2 | Configuration, Options |

Find more at: https://lucide.dev

---

## Troubleshooting

### Sidebar item appears but view is blank
- ✅ Check `MainContent.tsx` has the case statement
- ✅ Verify the Tab name matches exactly (case-sensitive)
- ✅ Ensure view component is imported correctly

### Type errors
- ✅ Make sure you added the view name to the `Tab` type
- ✅ Check spelling is consistent across all 3 files

### Icon not showing
- ✅ Verify icon is imported from `lucide-react`
- ✅ Check the icon name matches lucide's naming

---

## Structure Overview

```
src/
├── types.ts                           ← Tab type union
├── components/
│   ├── sidebar/
│   │   └── NavigationMenu.tsx        ← Sidebar items
│   ├── layout/
│   │   └── MainContent.tsx           ← View routing
│   └── central/view/
│       ├── TradeMachineView.tsx       ← Your view component
│       └── ... other views
```

---

**Last Updated:** 2026-03-27
