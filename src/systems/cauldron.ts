export type HerbType = 'Moonpetal' | 'Silver Fern' | 'Starlight Dew';
export type PotionId = 'astral_portal' | 'gale_broom' | 'fairy_light' | 'star_step';

export interface PotionRecipe {
  id: PotionId;
  name: string;
  ingredients: HerbType[];
  baseDuration: number;
  description: string;
}

const RECIPES: PotionRecipe[] = [
  {
    id: 'astral_portal',
    name: 'Astral Portal Elixir',
    ingredients: ['Moonpetal', 'Silver Fern', 'Starlight Dew'],
    baseDuration: 30,
    description: 'Unseals the Starlit Sanctuary Portal at the north clearing!',
  },
  {
    id: 'gale_broom',
    name: 'Gale-Broom Draught',
    ingredients: ['Silver Fern', 'Starlight Dew'],
    baseDuration: 20,
    description: 'Enchants your broom! Press [SPACE] to fly over walls & streams',
  },
  {
    id: 'fairy_light',
    name: 'Fairy-Light Tonic',
    ingredients: ['Moonpetal', 'Starlight Dew'],
    baseDuration: 24,
    description: 'Expands silver moonlight & illuminates the forest',
  },
  {
    id: 'star_step',
    name: 'Star-Step Elixir',
    ingredients: ['Moonpetal', 'Silver Fern'],
    baseDuration: 18,
    description: 'Grants swift fairy-wind movement speed',
  },
];

export class CauldronSystem {
  private recipeLookup = new Map<string, PotionRecipe>();

  constructor() {
    for (const recipe of RECIPES) {
      this.recipeLookup.set(this.makeKey(recipe.ingredients), recipe);
    }
  }

  private makeKey(herbs: HerbType[]): string {
    return [...herbs].sort().join('+');
  }

  lookupByHerbs(herbs: HerbType[]): PotionRecipe | undefined {
    return this.recipeLookup.get(this.makeKey(herbs));
  }

  canCraft(recipe: PotionRecipe, pouch: Map<HerbType, number>): boolean {
    const needed = new Map<HerbType, number>();
    for (const herb of recipe.ingredients) {
      needed.set(herb, (needed.get(herb) ?? 0) + 1);
    }
    for (const [herb, count] of needed.entries()) {
      if ((pouch.get(herb) ?? 0) < count) return false;
    }
    return true;
  }

  findCraftableRecipe(pouch: Map<HerbType, number>): PotionRecipe | null {
    for (const recipe of RECIPES) {
      if (this.canCraft(recipe, pouch)) return recipe;
    }
    return null;
  }

  brewFirstAvailable(pouch: Map<HerbType, number>): PotionRecipe | null {
    const recipe = this.findCraftableRecipe(pouch);
    if (!recipe) return null;

    for (const herb of recipe.ingredients) {
      const count = pouch.get(herb) ?? 0;
      if (count <= 1) {
        pouch.delete(herb);
      } else {
        pouch.set(herb, count - 1);
      }
    }
    return recipe;
  }

  getAllRecipes(): PotionRecipe[] {
    return RECIPES;
  }
}