// ==UserScript==
// @name         olx true m2 price
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  jak chce mieszkanie za 3000 zl to raczej nie chce mieszkania za 3000 zl + milion zl czynszu jak cos (taka ciekawostka)
// @author       makin
// @match        https://www.olx.pl/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=olx.pl
// @grant        none
// ==/UserScript==

// original console object machen (without tracking)
const console = window.console;

const rentCategoryId = 15;

function patchTitle(title, rentlessPrice) {
  return `${title} - ❌ ${rentlessPrice} zł`;
}

function interceptPwaLazyOffers() {
  let orgFetch = window.fetch;
  window.fetch = async (url, options, ...rest) => {
    const resp = await orgFetch(url, options, ...rest);
    return interceptFetchResponse(url, options, resp);
  };
}

async function interceptFetchResponse(url, options, resp) {
  try {
    const parsedUrl = new URL(url);
    if (
      resp.ok &&
      parsedUrl.host === "www.olx.pl" &&
      parsedUrl.pathname === "/apigateway/graphql" &&
      options?.body != null
    ) {
      const postBody = JSON.parse(options.body);
      if (postBody.query?.startsWith("query ListingSearchQuery")) {
        return await patchListingResponse(resp);
      }
    }
  } catch (ex) {
    console.error("patch gql response error:", ex);
  }
  return resp;
}

function getPriceRange() {
  const priceSection = Array.from(document.querySelectorAll('div'))
    .find(div => div.textContent && div.textContent.trim().startsWith('Cena'));
  const fromInput = priceSection.querySelector('input[data-testid="range-from-input"]');
  const toInput = priceSection.querySelector('input[data-testid="range-to-input"]');
  const from = fromInput ? parseInt(fromInput.value, 10) : null;
  const to = toInput ? parseInt(toInput.value, 10) : null;
  return { from, to };
}

function isPriceInRange(price, from, to) {
  if (from != null && price < from) return false;
  if (to != null && price > to) return false;
  return true;
}

async function patchListingResponse(resp) {
  const body = await resp.json();
  body.data.clientCompatibleListings.data =
    body.data.clientCompatibleListings.data.map(patchOffer)
      .filter((offer) => {
        const priceParam = offer.params.find((param) => param.key === "price");
        let price = priceParam?.value?.value;
        if (offer.category?.id === rentCategoryId) {
          const rent = offer.params.find((param) => param.key === "rent")?.value?.key;
          if (rent != null) price = price + parseFloat(rent);
        }
        const { from, to } = getPriceRange();
        return price !== undefined && isPriceInRange(price, from, to);
      });
  return new Response(JSON.stringify(body), {
    status: resp.status,
    statusText: resp.statusText,
    headers: resp.headers,
  });
}

function patchOffer(offer) {
  try {
    if (offer.category?.id === rentCategoryId) {
      const priceParam = offer.params.find((param) => param.key === "price");
      const price = priceParam?.value?.value;
      if (price !== undefined) {
        const mods = getRentOfferModifications({
          title: offer.title,
          price,
          rent: offer.params.find((param) => param.key === "rent")?.value?.key,
        });
        offer.title = mods.title ?? offer.title;
        priceParam.value.label = mods.priceLabel;
      }
    }
  } catch (ex) {
    console.error("patch offer error:", ex);
  }
  return offer;
}

function getRentOfferModifications({ title, price, rent }) {
  if (rent == null) {
    return {
      priceLabel: `❓ ${Math.ceil(price)} zł`,
    };
  } else {
    const fullPrice = price + parseFloat(rent);
    return {
      priceLabel: `✅ ${Math.ceil(fullPrice)} zł`,
      title: patchTitle(title, price),
    };
  }
}

function patchPrerenderedState() {
  if (window.__PRERENDERED_STATE__ == null) {
    return;
  }
  const prerenderedState = JSON.parse(window.__PRERENDERED_STATE__);
  const { from, to } = getPriceRange();
  prerenderedState.listing.listing.ads =
    prerenderedState.listing.listing.ads
      .map((offer) => {
        const price = offer.price.regularPrice?.value;
        if (price != null) {
          const mods = getRentOfferModifications({
            title: offer.title,
            price,
            rent: offer.params.find((param) => param.key === "rent")
              ?.normalizedValue,
          });
          offer.price.displayValue = mods.priceLabel;
          offer.title = mods.title ?? offer.title;
        }
        return offer;
      })
      .filter((offer) => {
        let price = offer.price.regularPrice?.value;
        const rent = offer.params.find((param) => param.key === "rent")?.normalizedValue;
        if (rent != null) price = price + parseFloat(rent);
        return price != null && isPriceInRange(price, from, to);
      });
  window.__PRERENDERED_STATE__ = JSON.stringify(prerenderedState);
}

interceptPwaLazyOffers();
patchPrerenderedState();
