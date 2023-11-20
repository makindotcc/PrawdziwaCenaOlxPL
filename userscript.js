// ==UserScript==
// @name         olx true m2 price
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  jak chce mieszkanie za 3000 zl to raczej nie chce mieszkania za 3000 zl + milion zl czynszu jak cos (taka ciekawostka)
// @author       makin
// @match        https://www.olx.pl/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=olx.pl
// @grant        none
// ==/UserScript==

function patchPrice(rentlessPrice, rent) {
  return rent == null
    ? "poszukaj w opisie Xddd"
    : `✅ ${Math.ceil(rentlessPrice + parseFloat(rent))} zł`;
}

function patchTitle(title, rentlessPrice) {
  return `${title} - ${rentlessPrice} zł`;
}

function interceptPwaLazyOffers() {
  let orgFetch = window.fetch;
  window.fetch = async (url, ...rest) => {
    const resp = await orgFetch(url, ...rest);
    const parsedUrl = new URL(url);
    if (
      resp.ok &&
      parsedUrl.host === "www.olx.pl" &&
      parsedUrl.pathname === "/api/v1/offers/" &&
      parsedUrl.searchParams.get("category_id") === "15"
    ) {
      const body = await resp.json();
      const modifiedBody = {
        ...body,
        data: body?.data?.map((offer) => ({
          ...offer,
          title: patchTitle(
            offer.title,
            offer.params.find((param) => param.key === "price").value.value
          ),
          params: offer.params.map((param) => {
            if (param.key === "price") {
              const rentlessPrice = param.value.value;
              const rent = offer.params.find((param) => param.key === "rent")
                ?.value?.key;
              return {
                ...param,
                value: {
                  ...param.value,
                  label: patchPrice(rentlessPrice, rent),
                },
              };
            } else {
              return param;
            }
          }),
        })),
      };
      return new Response(JSON.stringify(modifiedBody), {
        status: resp.status,
        statusText: resp.statusText,
        headers: resp.headers,
      });
    }
    return resp;
  };
}

function patchPrerenderedState() {
  if (window.__PRERENDERED_STATE__ == null) {
    return;
  }
  const prerenderedState = JSON.parse(window.__PRERENDERED_STATE__);
  if (
    !prerenderedState.listing.breadcrumbs.some(
      (breadcrumb) => breadcrumb.label === "Wynajem"
    )
  ) {
    return;
  }
  prerenderedState.listing.listing.ads =
    prerenderedState.listing.listing.ads.map((offer) => {
      const rentlessPrice = offer.price.regularPrice?.value;
      if (rentlessPrice == null) {
        return offer;
      }
      return {
        ...offer,
        title: patchTitle(offer.title, rentlessPrice),
        price: {
          ...offer.price,
          displayValue: patchPrice(
            rentlessPrice,
            offer.params.find((param) => param.key === "rent")?.normalizedValue
          ),
        },
      };
    });
  window.__PRERENDERED_STATE__ = JSON.stringify(prerenderedState);
}

patchPrerenderedState();
interceptPwaLazyOffers();
