"""Scraper de precios de Hard Wind (hardwind.com, tienda Tiendanube).

Recorre las categorías de la tienda con un Chromium headless (Playwright),
saca nombre y precio de cada producto y guarda todo en prices.csv.

Uso:
    pip install playwright
    playwright install chromium
    python scripts/hardwind_scraper.py              # categorías por defecto
    python scripts/hardwind_scraper.py wing foil    # solo esas categorías
"""

import csv
import sys
import time

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

BASE_URL = "https://hardwind.com"
CATEGORIES = ["wing", "foil", "neoprenes", "straps-y-botas", "accesorios1", "usado"]
MAX_PAGES = 15            # tope de páginas por categoría
DELAY_SECONDS = 3         # pausa entre páginas, para no cargar al servidor
TIMEOUT_MS = 30_000
OUTPUT_FILE = "prices.csv"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

# Selectores del tema de Tiendanube: cada producto del listado es un
# .js-item-product; adentro, el nombre está en .js-item-name y el precio
# visible en .js-price-display.
PRODUCT_SELECTOR = ".js-item-product"
NAME_SELECTOR = ".js-item-name"
PRICE_SELECTOR = ".js-price-display"


def page_url(category: str, page: int) -> str:
    """Tiendanube pagina las categorías como /<categoría>/page/<n>/."""
    return f"{BASE_URL}/{category}/" if page == 1 else f"{BASE_URL}/{category}/page/{page}/"


def clean(text: str | None) -> str:
    return " ".join((text or "").split())


def extract_products(page) -> list[dict]:
    """Lee los contenedores de producto de la página ya cargada."""
    products = []
    for item in page.locator(PRODUCT_SELECTOR).all():
        try:
            name_el = item.locator(NAME_SELECTOR).first
            # Si el tema no trae .js-item-name, el título también está en el link
            name = clean(name_el.inner_text()) if name_el.count() else clean(item.locator("a[title]").first.get_attribute("title"))
            price_el = item.locator(PRICE_SELECTOR).first
            price = clean(price_el.inner_text()) if price_el.count() else ""
            if name:
                products.append({"Product Name": name, "Price": price or "Consultar"})
        except PlaywrightError as err:
            # Un producto con estructura distinta no corta el resto
            print(f"  ! producto salteado: {err.message.splitlines()[0]}")
    return products


def scrape_category(page, category: str) -> list[dict]:
    """Recorre las páginas de una categoría hasta que no haya más productos."""
    results = []
    for n in range(1, MAX_PAGES + 1):
        url = page_url(category, n)
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT_MS)
            if response is None or response.status >= 400:
                print(f"  {url}: HTTP {response.status if response else '?'}, fin de la categoría")
                break
            found = extract_products(page)
        except PlaywrightTimeout:
            print(f"  {url}: tardó demasiado, sigo con la próxima categoría")
            break
        except PlaywrightError as err:
            print(f"  {url}: error ({err.message.splitlines()[0]}), sigo con la próxima categoría")
            break

        # Tiendanube repite la última página cuando se pide una que no existe
        new = [p for p in found if p not in results]
        print(f"  {url}: {len(found)} productos ({len(new)} nuevos)")
        if not new:
            break
        results.extend(new)
        time.sleep(DELAY_SECONDS)
    return results


def save_csv(rows: list[dict], path: str = OUTPUT_FILE) -> None:
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["Product Name", "Price"])
        writer.writeheader()
        writer.writerows(rows)


def main(categories: list[str]) -> int:
    rows: list[dict] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=USER_AGENT, locale="es-AR")
        page = context.new_page()
        try:
            for i, category in enumerate(categories):
                print(f"Categoría: {category}")
                for row in scrape_category(page, category):
                    if row not in rows:  # un producto puede estar en varias categorías
                        rows.append(row)
                if i < len(categories) - 1:
                    time.sleep(DELAY_SECONDS)
        finally:
            browser.close()

    save_csv(rows)
    print(f"Listo: {len(rows)} productos guardados en {OUTPUT_FILE}")
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or CATEGORIES))
