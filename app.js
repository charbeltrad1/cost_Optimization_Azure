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

let csvData = [];

(async () => {
  const loadData = async () => {
    const stream = fs.createReadStream('azureprice-export.csv');
    await new Promise((resolve, reject) => {
      stream.pipe(csv())
        .on('data', (row) => {
          csvData.push(row);
        })
        .on('end', () => {
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  };

  await loadData(); // wait for the data to load

})();
app.get("/", function(req, res) {
  console.log(csvData); // log the csvData variable

    res.render("list", {
    });
});

app.get("/mode1", function(req, res) {
  let vmsNames = csvData.map(e=>{
    return e['\ufeffname'];
  });
  res.render("mode1", {vmsNames: vmsNames});
});
app.get("/mode2", function(req, res) {
  res.render("mode2", {});
});
app.get("/result", function(req, res) {
  res.render("result", {
    decisions: decisions,
  });
});
app.post("/mode1", async function(req, res) {
  const formData = req.body;

  const vmSize = formData.vmSize;
  const location = formData.location;
  const low = formData.low;
  const windows = formData.windows;
  const currencycode = formData.currencycode;
  const clientVM = formData.clientVM;

  const apiUrl = `https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview&currencyCode=${currencycode}&$filter=armRegionName%20eq%20%27${location}%27%20and%20contains(armSkuName,%20%27${vmSize}%27)%20and%20priceType%20eq%20%27Consumption%27`;
  const response = await fetch(apiUrl);
  const data = await response.json();

  const dataItems = (data.Items).filter(item=>{
    let filter1 = !item.skuName.includes("Spot");
    let filter2 = low ? item.skuName.includes("Low") : !item.skuName.includes("Low");
    let filter3 = windows ? item.productName.includes("Windows") : !item.productName.includes("Windows");
    let filter4 = item.serviceName==='Virtual Machines';
    return filter1 && filter2 && filter3 && filter4;
  })
  console.log("----------------------------------------------------------------------------------------------------")

  console.log(dataItems);
  console.log("----------------------------------------------------------------------------------------------------")

  //Getting the vm price
  let answer1 = csvData.find(element=>{
    return element['\ufeffname'] === clientVM
  });
  let ExistingVM = {};
  ExistingVM[clientVM]={
      vcpu: Number(answer1.numberOfCores),
      memory: Number(answer1.memoryInMB)
  };

  let pricevm = dataItems.find(element=>{
    return element.armSkuName.startsWith(clientVM);
  })
  ExistingVM[clientVM].price = Number(pricevm.unitPrice);
  console.log("----------------------------------------------------------------------------------------------------")

  console.log(ExistingVM);
  console.log("----------------------------------------------------------------------------------------------------")

  let result={}
  dataItems.forEach(item => {
    let answer2 = csvData.find(element=>{
      return element['\ufeffname'] === item.armSkuName && element['\ufeffname'] != clientVM;
    });
    try{
      result[item.armSkuName]={
        price: Number(item.unitPrice),
        vcpu: Number(answer2.numberOfCores),
        memory: Number(answer2.memoryInMB)
      };
    }catch{
      console.log(`Cant find ${item.armSkuName} in the internal excel sheet`);
    }
  });
  console.log("----------------------------------------------------------------------------------------------------")

  console.log(result);
  console.log("----------------------------------------------------------------------------------------------------")

  let decisions = [];
  decisions.push(`You are using now ${clientVM} at ${currencycode} ${ExistingVM[clientVM].price} with VCPUs = ${ExistingVM[clientVM].vcpu} and memory = ${ExistingVM[clientVM].memory} GiB\n`);

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
});

app.listen(3000, function() {
  console.log("Server started on port 3000");
});

