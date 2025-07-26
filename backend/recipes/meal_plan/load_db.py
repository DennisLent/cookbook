import pandas as pd
from pathlib import Path


DATA_DIR = Path("backend/recipes/meal_plan")
OUTFILE  = "test.csv"
assert DATA_DIR.exists(), f"Can't find {DATA_DIR.resolve()}"

FACTORS   = {"Protein":4,
             "Carbohydrate, by difference":4,
             "Total lipid (fat)":9}

# IDs for energy measures in the FDC nutrient table
ENERGY_IDS = {
    "meas_kcal":                 1008,   # "Energy (kcal)"
    "meas_kcal_at":              1062,   # "Energy (Atwater General Factors)"
    "meas_kj":                   2047,   # "Energy (kJ)"
    "meas_kj_at":                2048,   # "Energy (kJ) (Atwater General Factors)"
}


food = pd.read_csv(
    DATA_DIR / "food.csv",
    usecols=["fdc_id","description","food_category_id"]
).rename(columns={"description":"food_name"})

category = (
    pd.read_csv(DATA_DIR / "food_category.csv", usecols=["id","description"])
      .rename(columns={"id":"food_category_id",
                       "description":"food_group"})
)

nutrient = pd.read_csv(
    DATA_DIR / "nutrient.csv",
    usecols=["id","name","nutrient_nbr"]
).rename(columns={"id":"nutrient_id","name":"nutrient_name"})

fn = pd.read_csv(
    DATA_DIR / "food_nutrient.csv",
    usecols=["fdc_id","nutrient_id","amount"]
)


long = (
    fn
    .merge(food,      on="fdc_id",          how="left")
    .merge(category,  on="food_category_id", how="left")
    .merge(nutrient,  on="nutrient_id",     how="left")
)


wide = (
    long
    .pivot_table(
        index=["fdc_id","food_name","food_group"],
        columns="nutrient_name",
        values="amount",
        aggfunc="mean"
    )
    .reset_index()
)

for macro in FACTORS:
    wide[macro] = (
        wide
        .groupby("food_group")[macro]
        .transform(lambda g: g.fillna(g.mean()))
    )

all_foods = (
    food
    .merge(category, on="food_category_id", how="left")
    [["fdc_id", "food_name", "food_group"]]
    .drop_duplicates()
)

wide = all_foods.merge(wide, on=["fdc_id","food_name","food_group"], how="left")


energy_col_map = {
    "meas_kcal":    "Energy",
    "meas_kcal_at": "Energy (Atwater General Factors)",
    "meas_kj":      "Energy (kJ)",
    "meas_kj_at":   "Energy (kJ) (Atwater General Factors)",
}

def compute_meas_kcal(row):

    v = row.get(energy_col_map["meas_kcal"])
    if pd.notna(v): return v

    v = row.get(energy_col_map["meas_kcal_at"])
    if pd.notna(v): return v

    v = row.get(energy_col_map["meas_kj"])
    if pd.notna(v): return v / 4.184

    v = row.get(energy_col_map["meas_kj_at"])
    if pd.notna(v): return v / 4.184
    return pd.NA

wide["meas_kcal"] = wide.apply(compute_meas_kcal, axis=1)

wide["calc_kcal"] = (
    wide["Protein"].fillna(0)*4 +
    wide["Carbohydrate, by difference"].fillna(0)*4 +
    wide["Total lipid (fat)"].fillna(0)*9
)
wide["kcal_per_100g"] = wide["meas_kcal"].fillna(wide["calc_kcal"])


wide["kcal_per_100g"] = (
    wide
    .groupby("food_group")["kcal_per_100g"]
    .transform(lambda g: g.fillna(g.mean()))
)


global_mean = wide["kcal_per_100g"].mean()
wide["kcal_per_100g"] = wide["kcal_per_100g"].fillna(global_mean)


final = (
    wide
    .groupby(["food_name","food_group"], as_index=False)
    .agg(kcal_per_100g=("kcal_per_100g","mean"))
)

out_path = DATA_DIR / OUTFILE
final.to_csv(out_path, index=False)
print(f"Saved {len(final)} foods to {out_path}")
