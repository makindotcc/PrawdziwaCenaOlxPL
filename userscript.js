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

const rentCategoryId = "15";

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
      if (
        postBody.query?.startsWith("query ListingSearchQuery") &&
        postBody.variables?.searchParameters?.some(
          (param) =>
            param.key === "category_id" && param.value === rentCategoryId
        )
      ) {
        return await patchListingResponse(resp);
      }
    }
  } catch (ex) {
    // original console object machen without tracking
    window.console.error("patch gql response error:", ex);
  }
  return resp;
}

async function patchListingResponse(resp) {
  const body = await resp.json();
  body.data.clientCompatibleListings.data =
    body.data.clientCompatibleListings.data.map(patchOffer);
  return new Response(JSON.stringify(body), {
    status: resp.status,
    statusText: resp.statusText,
    headers: resp.headers,
  });
}

function patchOffer(offer) {
  offer.params = offer.params.map((param) => {
    if (param.key === "price") {
      const rentlessPrice = param.value.value;
      const rent = offer.params.find((param) => param.key === "rent")?.value
        ?.key;
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
  });
  return offer;
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
