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
    const pattern = /^[a-zA-Z0-9]+_[a-zA-Z0-9]+_[a-zA-Z0-9]+$/;
    await new Promise((resolve, reject) => {
      stream.pipe(csv())
        .on('data', (row) => {
          if(pattern.test(row['\ufeffname'])){
            csvData.push(row);
          }
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
  let vmsNames = csvData.map(e=>{
    return e['\ufeffname'];
  });
  res.render("mode1", {vmsNames: vmsNames});
});

app.post("/mode1", async function(req, res) {
  const formData = req.body;
  const vmSize = formData.vmSize;
  const location = formData.location;
  const low = formData.low;
  const windows = formData.windows;
  const currencycode = formData.currencycode;
  const clientVM = formData.clientVM;

  let apiUrl = `https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview&currencyCode=${currencycode}&$filter=`;
  apiUrl+=`armRegionName%20eq%20%27${location}%27%20`;
  apiUrl+=`and%20contains(armSkuName,%20%27${vmSize}%27)%20`;
  apiUrl+=`and%20contains(skuName,%20%27Spot%27)%20ne%20true%20`;
  apiUrl+=low ? `and%20contains(skuName,%20%27Low%27)%20` : `and%20contains(skuName,%20%27Low%27)%20ne%20true%20`;
  apiUrl+=windows ? `and%20contains(productName,%20%27Windows%27)%20` : `and%20contains(productName,%20%27Windows%27)%20ne%20true%20`;
  apiUrl+=`and%20serviceName%20eq%20%27Virtual%20Machines%27%20`;
  apiUrl+=`and%20priceType%20eq%20%27Consumption%27`;
  console.log(apiUrl);

  let clientVMindex;
  let currentVM=[], decisions = [], savingsPlan = [];

  const response = await fetch(apiUrl);
  const data = await response.json();
  const dataItems = data.Items;
  try{
    dataItems.forEach((item,index)=>{
      let properties = csvData.find(element=>{
        return element['\ufeffname'] === item.armSkuName;
      });
      if (typeof properties != 'undefined') {
        dataItems[index].vcpu = Number(properties.numberOfCores);
        dataItems[index].memory = Number(properties.memoryInMB);
        dataItems[index].iops = Number(properties.combinedIOPS);

      }else{
        dataItems[index].vcpu = "No data";
        dataItems[index].memory = "No data";
        dataItems[index].iops = "No data";

      }
      if(item.armSkuName === clientVM){
        clientVMindex = index;
      }
    });
    currentVM.push({
      name: dataItems[clientVMindex].armSkuName,
      price: dataItems[clientVMindex].unitPrice,
      vcpu: dataItems[clientVMindex].vcpu,
      memory: dataItems[clientVMindex].memory,
      iops: dataItems[clientVMindex].iops,
      currencycode: currencycode,
      saving: 0
    });

    dataItems.forEach((item,index)=>{
      
      let condition1 = item.unitPrice <= dataItems[clientVMindex].unitPrice;
      let condition2 = item.vcpu != "No data" && item.memory != "No data" && item.iops != "No data";
      let condition3 = item.vcpu >= dataItems[clientVMindex].vcpu && item.memory >= dataItems[clientVMindex].memory && item.iops >= dataItems[clientVMindex].iops;
      let condition4 = index != clientVMindex
      if (condition1 && condition2 && condition3 && condition4) {
  
        let saving1= Math.ceil(100*(dataItems[clientVMindex].unitPrice-item.unitPrice)/dataItems[clientVMindex].unitPrice);

        decisions.push({
          name: item.armSkuName,
          price: item.unitPrice,
          vcpu: item.vcpu,
          memory: item.memory,
          iops: item.iops,
          currencycode: currencycode,
          saving: saving1
        });
        if(item.hasOwnProperty("savingsPlan")){
          item.savingsPlan.forEach(element=>{
            savingsPlan.push({
              name: item.armSkuName,
              price: element.unitPrice,
              vcpu: item.vcpu,
              memory: item.memory,
              iops: item.iops,
              currencycode: currencycode,
              term: element.term,
              saving1: saving1,
              saving2: Math.ceil(100*(item.unitPrice-element.unitPrice)/item.unitPrice),
              saving3: Math.ceil(100*(dataItems[clientVMindex].unitPrice-element.unitPrice)/dataItems[clientVMindex].unitPrice)
            });
          });
        }
      }
    });
  }catch(error){
    console.log(error);
  }

  res.send([currentVM, decisions,savingsPlan]);
});

app.listen(8080, function() {
  console.log("Server started on port 8080");
});

