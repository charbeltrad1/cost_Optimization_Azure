//jshint esversion:6

const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");

const app = express();
const _ = require("lodash");

const fs = require('fs');
const csv = require('csv-parser');
const { FORMERR } = require("dns");


app.set('view engine', 'ejs');

app.use(bodyParser.json());

app.use(express.static("public"));

app.get("/", function(req, res) {

    res.render("list", {
    });
});

app.get("/mode1", function(req, res) {
  res.render("mode1", {});
});
app.get("/mode2", function(req, res) {
  res.render("mode2", {});
});
app.get("/result", function(req, res) {
  res.render("result", {
    decisions: decisions,
  });
});
app.post("/mode1", function(req, res) {
  const formData = req.body;

  const vmSize = formData.vmSize;
  const location = formData.location;
  const low = formData.low;
  const windows = formData.windows;
  const currencycode = formData.currencycode;
  const clientVM = formData.clientVM;
  
  const apiUrl = `https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview&currencyCode=${currencycode}&$filter=armRegionName%20eq%20%27${location}%27%20and%20contains(armSkuName,%20%27${vmSize}%27)%20and%20priceType%20eq%20%27Consumption%27`;
  console.log(apiUrl);
  getVMproperties(apiUrl,vmSize,location,low,windows,currencycode,clientVM)
    .then( async ExistingVM => {
      let decisions = [];
        await decisions.push(`You are using now ${clientVM} at ${currencycode} ${ExistingVM[clientVM].price} with VCPUs = ${ExistingVM[clientVM].vcpu} and memory = ${ExistingVM[clientVM].memory} GiB\n`);
        getAzurePrices(apiUrl,vmSize,location,low,windows,currencycode,clientVM)
            .then(async result => {
                let minimum = ExistingVM[clientVM].price;
                let target =clientVM;
                for (let key in result) {
                    if (result[key].price <= ExistingVM[clientVM].price && result[key].vcpu >= ExistingVM[clientVM].vcpu && result[key].memory >= ExistingVM[clientVM].memory) {
                        await decisions.push(`You can switch to ${key} at ${currencycode} ${result[key].price} with VCPUs = ${result[key].vcpu} and memory = ${result[key].memory} GiB\n`)
                        if (result[key].price < minimum) {
                          minimum = result[key].price;
                          target = key;
                      }
                      }
                }
                if(minimum != ExistingVM[clientVM].price){
                  await decisions.push(`You can save up to ${Math.ceil(100*(ExistingVM[clientVM].price-minimum)/ExistingVM[clientVM].price)}% per 1 VM by Sku refactoring to ${target}`);
                }
                console.log(decisions);
                res.send(decisions);
            })
            .catch(error => console.error(error));
    }).catch(error => console.error(error));
});


async function getAzurePrices(apiUrl,vmSize,location,low,windows,currencycode,clientVM) {
  //Predicting replacements
  const response = await fetch(apiUrl);
  const data = await response.json();
  let result = {};

  for (const item of data.Items) {
      const filter2 = !item.skuName.includes("Spot");
      const filter3 = low ? item.skuName.includes("Low") : !item.skuName.includes("Low");
      const filter5 = windows ? item.productName.includes("Windows") : !item.skuName.includes("Windows");

      if (filter5 && filter2 && filter3) {
          const stream = fs.createReadStream('azureprice-export.csv');

          await new Promise(resolve => {
              stream.pipe(csv())
                  .on('data', (row) => {
                      if (row['\ufeffname'] === item.armSkuName && row['\ufeffname'] != clientVM) {
                          result[item.armSkuName]={
                              price: Number(item.unitPrice),
                              vcpu: Number(row.numberOfCores),
                              memory: Number(row.memoryInMB)
                          };
                      }
                  })
                  .on('end', resolve);
          });
      }
  }

  return result;
}
async function getVMproperties(apiUrl,vmSize,location,low,windows,currencycode,clientVM) {
  let result = {};

  const stream = fs.createReadStream('azureprice-export.csv');

  await new Promise(resolve => {
      stream.pipe(csv())
          .on('data', (row) => {
              if (row['\ufeffname'] === clientVM) {
                  result[clientVM] = {
                      vcpu: Number(row.numberOfCores),
                      memory: Number(row.memoryInMB)
                  };
              }
          })
          .on('end', resolve);
  });

  const response = await fetch(apiUrl);
  const data = await response.json();

  for (const item of data.Items) {
      const filter1 = !item.skuName.includes("Spot");
      const filter2 = low ? item.skuName.includes("Low") : !item.skuName.includes("Low");
      const filter3 = windows ? item.productName.includes("Windows") : !item.skuName.includes("Windows");
      const filter4 = item.armSkuName === clientVM
      if (filter1 && filter2 && filter3 && filter4) {
          result[clientVM].price = Number(item.unitPrice);
      }
  }

  return result;
}

app.listen(3000, function() {
  console.log("Server started on port 3000");
});

s