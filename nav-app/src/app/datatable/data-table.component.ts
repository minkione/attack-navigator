import { Component, Input, ViewChild, HostListener, AfterViewInit } from '@angular/core';
import {DataService, Technique} from '../data.service';
import { TabsComponent } from '../tabs/tabs.component';
import { ViewModel, TechniqueVM, Filter, Gradient, Gcolor, ViewModelsService } from "../viewmodels.service";
import {FormControl} from '@angular/forms';
import {DomSanitizer, SafeStyle} from '@angular/platform-browser';
import {MatSelectModule} from '@angular/material/select';
import {MatCheckboxModule} from '@angular/material/checkbox';

import {MatMenuTrigger} from '@angular/material/menu';

declare var tinygradient: any; //use tinygradient
declare var tinycolor: any; //use tinycolor2

import * as FileSaver from 'file-saver';

@Component({
    selector: 'DataTable',
    templateUrl: './data-table.component.html',
    styleUrls: ['./data-table.component.scss'],
    providers: [DataService]
})
export class DataTableComponent implements AfterViewInit {

    ////////////////
    // DATA TABLE //
    // VARIABLES  //
    ////////////////

    // Stores the techniques and tacticsdisplayed in the dataTable
    actTechniques: Technique[] = [];
    prepareTechniques: Technique[] = [];
    techniques: Technique[] = [];
    tactics = {};
    tacticStages = {};

    // The techniques and tactics being displayed after filters are applied
    filteredTechniques: Technique[] = [];
    filteredTactics = {};

    // Stores properly formated tactic names to use in data-table headers
    tacticDisplayNames = {};

    // Stores properly formated names for the malware, tools, and threat groups
    threatGroupList: SecurityInstance[] = [];
    softwareGroupList: SecurityInstance[] = [];

    selectedTechniques = new Set();

    searchString = "";
    searchResults = [];
    searchingName = true;
    searchingID = true;
    searchingDescription = true;

    // The ViewModel being used by this data-table
    @Input() viewModel: ViewModel;

    currentDropdown: string = ""; //current dropdown menu

    // The data service that delivers the technique/tactic data
    ds: DataService = null;

    clickTactic(tacticName) {
        // console.log(tacticName, this.viewModel.highlightedTactic)
        if (this.viewModel.highlightedTactic == tacticName) this.viewModel.highlightedTactic = null;
        else this.viewModel.highlightedTactic = tacticName;
    }

    containsActiveTechnique(tacticName) {
        if (this.viewModel.highlightedTechnique == null || this.viewModel.highlightedTactic == null) return false;
        for (let i = 0; i < this.techniques.length; i++) {
            if (this.techniques[i].technique_id === this.viewModel.highlightedTechnique.technique_id)
                return this.techniques[i].tactics.includes(tacticName)
        }
    }

    ////////////////////////////////////////////////////////////////////
    // Updates the search list interface based on the search string.  //
    // Called whenever the input is updated.                          //
    ////////////////////////////////////////////////////////////////////

    updateSearchDropdown(){
        // Clear the previous results and initialize result holders
        this.searchResults = [];
        var nameResults = [], idResults = [], descriptionResults = [];

        if(this.searchString === null || this.searchString === ""){
            return;
        }
        // Create a regular expression to search for
        var formattedInput = this.searchString.toLowerCase();
        var re = new RegExp(formattedInput, "g");

        for(var i = 0; i < this.filteredTechniques.length; i++){
            if(this.searchingName){
                var name = this.filteredTechniques[i].name.toLowerCase();
                var nameResult = name.search(re);
                if(nameResult !== -1){
                    nameResults.push(this.filteredTechniques[i]);
                }
            }
            if(this.searchingID){
                var id = this.filteredTechniques[i].technique_id.toLowerCase();
                var idResult = id.search(re);
                if(idResult !== -1){
                    idResults.push(this.filteredTechniques[i]);
                }
            }
            if(this.searchingDescription){
                var description = this.filteredTechniques[i].description.toLowerCase();
                var descriptionResult = description.search(re);
                if(descriptionResult !== -1){
                    descriptionResults.push(this.filteredTechniques[i]);
                }
            }
        }
        // Add the results in order of name, ID, and description
        var searchSet = new Set([...nameResults, ...idResults, ...descriptionResults]);
        this.searchResults = Array.from(searchSet);
    }

    selectAllInSearch(){
        for(var i = 0; i < this.searchResults.length; i++){
            this.viewModel.addToTechniqueSelection(this.searchResults[i]);
        }
    }

    deselectAllInSearch(){
        for(var i = 0; i < this.searchResults.length; i++){
            this.viewModel.removeFromTechniqueSelection(this.searchResults[i]);
        }
    }

    ///////////////////////////////////////////////////////////
    // FILTERS THE TECHNIQUES TO SHOW WHAT THE USER REQUESTS //
    //   Filters the stages, then platforms, and finally     //
    //   sorts the techniques by name.                       //
    ///////////////////////////////////////////////////////////

    filterTechniques(){
        // copies the list of techniques
        var filteredTechniques = this.techniques;
        // filters out using the stages and platforms dropdowns
        filteredTechniques = this.filterStages(filteredTechniques);
        filteredTechniques = this.filterPlatforms(filteredTechniques);
        if (this.viewModel.hideDisabled) filteredTechniques = this.removeDisabled(filteredTechniques)
        // sort
        let self = this;
        filteredTechniques.sort(function(t1:Technique, t2:Technique): number {
            let t1vm = self.viewModel.getTechniqueVM(t1.technique_id)
            let t2vm = self.viewModel.getTechniqueVM(t2.technique_id)
            let c1 = String(t1vm.score).length > 0 ? Number(t1vm.score) : 0;
            let c2 = String(t2vm.score).length > 0 ? Number(t2vm.score) : 0;
            switch(self.viewModel.sorting){
                case 0:
                    return t1.name.localeCompare(t2.name);
                case 1:
                    return t2.name.localeCompare(t1.name);
                case 2:
                    if (c1 === c2) return t1.name.localeCompare(t2.name);
                    else return c1 - c2
                case 3:
                    if (c1 === c2) return t1.name.localeCompare(t2.name);
                    else return c2 - c1
                default:
                    return t1.name.localeCompare(t2.name);
            }
        })
        // sets the displayed filteredTechniques to the newly filtered ones
        this.filteredTechniques = filteredTechniques;
        this.tactics = this.ds.techniquesToTactics(filteredTechniques);
    }


    ///////////////////////////////////////////////////////////
    // FILTERS THE TECHNIQUES USING THE VALUES SET BY THE    //
    // STAGES FILTER DROPDOWN                                //
    //     Returns an array of the newly filtered techniques //
    ///////////////////////////////////////////////////////////

    filterStages(preFilteredTechniques){
        var filteredTechniques = [];

        var stagesSelected: string[] = this.viewModel.filters.stages.selection;
        var addPrepare = false;
        var addAct = false;
        if(stagesSelected.length === 1){
            if(stagesSelected[0].localeCompare("act") === 0){
                addAct = true;
            } else {
                addPrepare = true;
            }
        } else if(stagesSelected.length > 1){
            addPrepare = true;
            addAct = true;
        }
        // based on the platforms set, use the preset technique arrays to make a final
        //    filtered array
        if(addPrepare){
            filteredTechniques = filteredTechniques.concat(this.prepareTechniques);
        }
        if(addAct){
            filteredTechniques = filteredTechniques.concat(this.actTechniques);
        }
        return filteredTechniques;
    }

    //////////////////////////////////////////////////////////////////////////////////
    // FILTERS THE TECHNIQUES USING THE VALUES SET BY THE PLATFORMS FILTER DROPDOWN //
    //     Returns an array of the newly filtered techniques                        //
    //////////////////////////////////////////////////////////////////////////////////

    filterPlatforms(preFilteredTechniques){
        var selectedPlatforms: string[] = this.viewModel.filters.platforms.selection;

        if(selectedPlatforms.length === 0){
            return [];
        }else if(selectedPlatforms.length === this.viewModel.filters.platforms.options.length){
            return preFilteredTechniques;
        } else {
            var filteredTechniques: Technique[] = [];
            // For each technique
            for(var i = 0; i < preFilteredTechniques.length; i++){
                var technique = preFilteredTechniques[i];
                var techniquePlatforms = technique.platforms;
                if(techniquePlatforms === null || techniquePlatforms === undefined){
                    filteredTechniques.push(technique);
                } else {
                    var matched = false;
                    // For each platform
                    for(var p = 0; p < techniquePlatforms.length; p++){
                        // For each desiredPlatform
                        var techPlat = techniquePlatforms[p].toLowerCase();
                        for (var f = 0; f < selectedPlatforms.length; f++){
                            var plat = selectedPlatforms[f].toLowerCase();
                            if(techPlat.indexOf(plat) !== -1){
                                matched = true;
                                filteredTechniques.push(technique);
                                break;
                            }
                        }
                        if(matched){
                            break;
                        }
                    }
                }

            }
            return filteredTechniques;
        }
    }

    removeDisabled(techniques: Technique[]) {
        let filtered: Technique[] = [];
        let self = this;
        techniques.forEach(function(technique) {
            // TODO other filters
            if (!(!self.viewModel.getTechniqueVM(technique.technique_id).enabled && self.viewModel.hideDisabled)) filtered.push(technique);
        })
        return filtered;
    }



    //////////////////////////////////////////////////////////
    // Stringifies the current view model into a json string//
    // stores the string as a blob                          //
    // and then saves the blob as a json file               //
    //////////////////////////////////////////////////////////

    saveLayerLocally(){
        var json = this.viewModel.serialize(); //JSON.stringify(this.viewModel.serialize(), null, "\t");
        var blob = new Blob([json], {type: "text/json"});
        FileSaver.saveAs(blob, this.viewModel.name.replace(/ /g, "_") + ".json");
    }

    //////////////////////////////////////////////////////////////////////////
    // RETRIEVES THE TECHNIQUES, TACTICS, AND THREAT DATA FROM DATA SERVICE //
    //     Calls functions to format the data                               //
    //////////////////////////////////////////////////////////////////////////

    constructor(private dataService: DataService, private tabs: TabsComponent, private sanitizer: DomSanitizer, private viewModelsService: ViewModelsService) {
        this.ds = dataService;
        this.ds.retreiveConfig().subscribe((config: Object) => {
            this.ds.setUpURLs(config["enterprise_attack_url"],
                                config["pre_attack_url"],
                                config["mobile_data_url"],
                                config["tactics_url"]);
            var domain = config["domain"];
            dataService.getTactics().subscribe((tactics: Object[]) => {
                this.constructTacticList(tactics, domain);
                if(domain === "mitre-enterprise"){
                    dataService.getEnterpriseData().subscribe((enterpriseData: Object[]) => {
                        var objects = enterpriseData[1]["objects"].concat(enterpriseData[0]["objects"]);
                        this.establishData(objects);
                    });
                } else if (domain === "mitre-mobile"){
                    dataService.getMobileData().subscribe((mobileData: Object[]) => {
                        var objects = mobileData[1]["objects"].concat(mobileData[0]["objects"]);
                        this.establishData(objects);
                    });
                }
            });
        });
    }

    /**
     * Angular lifecycle hook
     */
    ngAfterViewInit(): void {
        let element = <HTMLElement>document.getElementById("tooltip" + this.viewModelsService.getViewModelUID(this.viewModel));
        element.style.left = -10000 + "px";
    }

    ////////////////////////////////////////////////////
    // Handles the construction of tactic information //
    ////////////////////////////////////////////////////

    constructTacticList(totalTactics, domain){
        var tactics = [];
        var added = false;
        for(var setKey in totalTactics){
            var set = totalTactics[setKey];
            var domains = set.domains;
            added = false;
            for(var i = 0; i < domains.length; i++){
                if(domains[i] === domain && !added){
                    added = true;
                    tactics = tactics.concat(set.tactics);
                }
            }
        }
        this.ds.setTacticOrder(tactics);
        this.setTacticPhases(tactics);
    }

    ////////////////////////////////////////////////////
    // Creates a mapping of each tactic and its phase //
    ////////////////////////////////////////////////////

    setTacticPhases(tactics){
        this.tacticStages = {};
        for(var i = 0; i < tactics.length; i++){
            var tactic = tactics[i];
            this.tacticStages[tactic.tactic] = tactic.phase;
        }
    }

    //////////////////////////////////////////////////////////////////////
    // Does preliminary sorting before establishing the data structures //
    //////////////////////////////////////////////////////////////////////

    establishData(objects){
        var techniques = {}, threatGroups = {}, software = {}, relationships = {};
        for(var i = 0; i < objects.length; i++){
            var object = objects[i];
            if(object.type === "attack-pattern"){
                techniques[object.id] = object;
            } else if(object.type === "intrusion-set"){
                threatGroups[object.id] = object;
            } else if(object.type === "malware" || object.type === "tool"){
                software[object.id] = object;
            } else if(object.type === "relationship"){
                relationships[object.id] = object;
            }
        }

        this.establishTechniques(techniques);
        this.setTacticDisplayNames();
        // this.loadFilters();
        this.filterTechniques();

        this.establishThreatDataHolders(threatGroups, software);
        this.establishThreatData(techniques, relationships);
        this.searchResults = [];
    }

    ////////////////////////////////////////////////////////////////////////////////////////
    // Creates the arrays of Technique objects to be handled elsewhere in the application //
    ////////////////////////////////////////////////////////////////////////////////////////

    establishTechniques(techniques){
        var prepareTechniquesParsed: Technique[] = [], actTechniquesParsed: Technique[] = [];
        for(var techniqueID in techniques) {
            var t = techniques[techniqueID]
            // console.log(t)
            var tacticObject = t["kill_chain_phases"];
            var tacticFinal: string[] = [];
            if(tacticObject !== undefined){ tacticObject.forEach(function(tactic){ tacticFinal.push(tactic.phase_name); });}
            var url = "none", tid = "blank";
            if(t.external_references !== undefined){
                url = t.external_references[0].url;
                tid = t.external_references[0].external_id;
            }
            var formattedTechnique = new Technique(
                t.name,   t.description,   tacticFinal, url,
                t.x_mitre_platforms,   t.id,   tid
            );
            var stageString = this.tacticStages[tacticObject[0]["phase_name"]];
            if(stageString === "act"){
                actTechniquesParsed.push(formattedTechnique);
            } else {
                prepareTechniquesParsed.push(formattedTechnique);
            }
        };
        // Stores techniques in arrays according to phase
        prepareTechniquesParsed.sort(function(a,b) {return (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0);} );
        actTechniquesParsed.sort(function(a,b) {return (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0);} );

        this.actTechniques = actTechniquesParsed, this.prepareTechniques = prepareTechniquesParsed;
        this.techniques = this.actTechniques.concat(this.prepareTechniques);
        this.filteredTechniques = this.techniques;
        this.tactics = this.dataService.techniquesToTactics(this.techniques);

        if (this.viewModel) {
            for (let i = 0; i < this.techniques.length; i++) {
                // console.log("initializing VM", this.techniques[i].name)
                if (!this.viewModel.hasTechniqueVM(this.techniques[i].technique_id))
                    this.viewModel.setTechniqueVM(new TechniqueVM(this.techniques[i].technique_id));
                // don't initialize vms we already have -- from loading or whatever
            }
            this.viewModel.updateGradient();
        } else {
            console.error("no viewmodel to initialize data for!")
        }
    }

    // Sets a map of properly formated tactic names to display in the data table
    setTacticDisplayNames(){
        this.tacticDisplayNames = {};
        for(const tactic in this.tactics){
            var displayString = tactic.replace(new RegExp("-", 'g'), " ");
            displayString = this.toUpperCase(displayString);
            this.tacticDisplayNames[tactic] = displayString;
        }
    }

    establishThreatDataHolders(threatGroups, software){
        for(var threatGroupID in threatGroups){
            var threatGroupRawData = threatGroups[threatGroupID];

            // get url from mitre attack
            let url = ""
            for (let i = 0; i < threatGroupRawData.external_references.length; i++) {
                if (threatGroupRawData.external_references[i].source_name === "mitre-attack")  {
                    url = threatGroupRawData.external_references[i].url;
                    break;
                }
            }

            var threatGroup = new SecurityInstance(threatGroupRawData.name,
                "threat-group",
                threatGroupID, url);

            this.threatGroupList.push(threatGroup);
        }


        for(var softwareID in software){
            var softwareRawData = software[softwareID];
            // get url from mitre attack
            var url = ""
            for (let i = 0; i < softwareRawData.external_references.length; i++) {
                if (softwareRawData.external_references[i].source_name.startsWith("mitre-attack"))  {
                    url = softwareRawData.external_references[i].url;
                    break;
                }
            }

            var soft = new SecurityInstance(softwareRawData.name,
                "software",
                softwareID, url);

            this.softwareGroupList.push(soft);
        }
        this.threatGroupList.sort(function(a,b) {return (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0);} );
        this.softwareGroupList.sort(function(a,b) {return (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0);} );
    }

    /**
     * Add all techniques in the given security instance to the technique selection
     * @param si SecurityInstance object
     */
    selectSecurityInstance(si: SecurityInstance): void {
        let self = this;
        si.techniques.forEach(function(technique_id) {
            self.viewModel.addToTechniqueSelection_id(technique_id);
        })
    }

    /**
     *  Remove all techniques in the given security instance from the technique selection
     * @param si SecurityInstance object
     */
    deselectSecurityInstance(si: SecurityInstance): void {
        let self = this;
        si.techniques.forEach(function(technique_id) {
            self.viewModel.removeFromTechniqueSelection_id(technique_id);
        })
    }

    /**
     * Populate SecurityInstance objects' techniques array with relevant techniques
     * @param  techniques    technique list
     * @param  relationships relationship list
     */
    establishThreatData(techniques, relationships){
        // console.log(relationships)
        for (let relationship_id in relationships) {
            var relationship = relationships[relationship_id];
            var targetRef = relationship.target_ref;
            var sourceRef = relationship.source_ref;

            // determine what softwares or threat groups this pertains to
            let relevantSI: SecurityInstance = null;
            let relevantTechnique: Technique = null;

            // find relevant security instance
            let groupList = [this.softwareGroupList, this.threatGroupList];
            for (let i = 0; i < groupList.length && !relevantSI; i++) {
                let groupSecurityInstances = groupList[i];
                for (let j = 0; j < groupSecurityInstances.length && !relevantSI; j++) {
                    let securityInstance = groupSecurityInstances[j];
                    if (securityInstance.id === sourceRef) {
                        relevantSI = securityInstance;
                    }
                }
            }

            // find relevant technique
            for (let i = 0; i < this.techniques.length && !relevantTechnique; i++) {
                if (this.techniques[i].id == targetRef) {
                    relevantTechnique = this.techniques[i]
                }
            }

            if (relevantSI && relevantTechnique) {
                // console.log(relationship, relevantSI, relevantTechnique);
                relevantSI.techniques.push(relevantTechnique.technique_id);
            }

        }

        // cull threat groups and software with no associated techniques
        let culledSoftware = [];
        let culledThreatGroups = [];
        this.softwareGroupList.forEach(function(si: SecurityInstance) {
            if (si.techniques.length > 0) culledSoftware.push(si)
        });
        this.threatGroupList.forEach(function(si: SecurityInstance) {
            if (si.techniques.length > 0) culledThreatGroups.push(si)
        });
        this.softwareGroupList = culledSoftware;
        this.threatGroupList = culledThreatGroups;

        // console.log(this.softwareGroupList, this.threatGroupList);
    }




    // open a url in a new tab
    openURL(event, technique){
        var win = window.open(technique.external_references_url);
        if (win) {
            win.focus();
        } else {
            alert('Please allow popups for this website');
        }
    }


    // Capitalizes the first letter of each word in a string
    toUpperCase(str){
        return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
    }


    // edit field bindings
    commentEditField: string = "";
    scoreEditField: string = "";
    /**
     * triggered on left click of technique
     * @param  technique      technique which was left clicked
     * @param  addToSelection add to the technique selection (shift key) or replace selection?
     */
    techniqueSelectEvent(technique, addToSelection): void {
        if (addToSelection) {
            // TODO add/remove from selection
            if (this.viewModel.isTechniqueSelected(technique)) this.viewModel.removeFromTechniqueSelection(technique);
            else this.viewModel.addToTechniqueSelection(technique)
        } else {
            if (this.viewModel.getSelectedTechniqueCount() > 1) this.viewModel.replaceTechniqueSelection(technique)
            else if (this.viewModel.isTechniqueSelected(technique)) this.viewModel.clearTechniqueSelection();
            else this.viewModel.replaceTechniqueSelection(technique);
        }
        //don't do any control population if nothing is being edited
        if (!this.viewModel.isCurrentlyEditing()) {
            if (["comment", "score", "colorpicker"].includes(this.currentDropdown)) this.currentDropdown = ""; //remove technique control dropdowns, because everything was deselected
            return;
        }
        //else populate editing controls

        this.populateEditFields();
    }

    /**
     * populate edit fields. Gets common values if common values exist for all editing values
     */
    populateEditFields(): void {
        this.commentEditField = this.viewModel.getEditingCommonValue("comment");
        this.scoreEditField = this.viewModel.getEditingCommonValue("score");
    }

    contextMenuVisible = false;
    contextMenuSelectedTechnique: Technique = null;
    /**
     * called on right clicking a technique in the view, handles context menu stuff
     * @param  technique technique that was clicked
     * @param  event     click event
     * @return           false to suppress normal context menu
     */
    rightClickTechnique(technique, event) {
        this.contextMenuVisible = true;
        this.contextMenuSelectedTechnique = technique;
        // console.log(event, technique)
        let element = <HTMLElement>document.getElementById("contextMenu" + this.viewModelsService.getViewModelUID(this.viewModel));
        element.style.left = event.pageX + "px";
        element.style.top = event.pageY + "px";
        return false;
    }

    //tooltip facing, true for right align, false for left align
    tooltipDirection: boolean = false;
    /**
     * On mouse move, move the tooltip to the mouse location
     * @param event teh mouse move event
     */
    @HostListener('mousemove', ['$event'])
    @HostListener('mouseout', ['$event'])
    onMouseMove(event:MouseEvent): void {
        let element = <HTMLElement>document.getElementById("tooltip" + this.viewModelsService.getViewModelUID(this.viewModel));
        this.tooltipDirection = document.body.clientWidth - event.pageX < 150; //determine facing of tooltip
        if(this.viewModel.highlightedTechnique !== null && event.type == "mousemove"){
            element.style.left = this.tooltipDirection ? (event.pageX - 20 - element.clientWidth) + "px" : (event.pageX + 20) + "px";
            element.style.top = event.pageY + "px";
        } else {
            element.style.left = -10000 + "px";
        }

    }

    /**
     * Set the state (enabled/disabled) of the selected features
     */
    setSelectedState(): void {
        let currentState = this.viewModel.getEditingCommonValue('enabled')
        // console.log(currentState)
        if (currentState === '') this.viewModel.editSelectedTechniques('enabled',false)
        else                   this.viewModel.editSelectedTechniques('enabled',!currentState)
        this.filterTechniques();
    }

    //sanitize the given css so that it can be displayed without error
    sanitize(css) {
        return this.sanitizer.bypassSecurityTrustStyle(css);
    }

    /**
     * Return css classes for a technique
     * @param  {technique} technique the technique to get the class of
     * @param  {boolean}   mini is it the minitable?
     * @return {string}               the classes the technique should currently have
     */
    getClass(technique, mini=false) {
        let theclass = 'link noselect cell'
        if (!this.viewModel.getTechniqueVM(technique.technique_id).enabled)
            theclass += " disabled"
        // else theclass += " " + this.viewModel.getTechniqueVM(technique.technique_id).color
        if (this.viewModel.isTechniqueSelected(technique))
            theclass += " editing"
        if (this.viewModel.highlightedTechnique && this.viewModel.highlightedTechnique.technique_id == technique.technique_id)
            theclass += " highlight"
        if (mini)
            theclass += " mini"
        if (this.viewModel.getTechniqueVM(technique.technique_id).comment.length > 0)
            theclass += " has-comment"
        if (this.getTechniqueBackground(technique))
            theclass += " has-score-background"
        return theclass
    }

    /**
     * get the technique background style for ngstyle
     * @param  technique technique
     * @return           background object
     */
    getTechniqueBackground(technique: Technique) {
        let tvm = this.viewModel.getTechniqueVM(technique.technique_id)
        // don't display if disabled or highlighted
        if (!tvm.enabled || (this.viewModel.highlightedTechnique && this.viewModel.highlightedTechnique.technique_id == technique.technique_id)) return {}
        if (tvm.color) return {"background": tvm.color }
        if (tvm.score) return {"background": tvm.scoreColor }
        // return tvm.enabled && tvm.score && !tvm.color && !(this.viewModel.highlightedTechnique && this.viewModel.highlightedTechnique.technique_id == technique.technique_id)
    }

    /**
     * Get most readable text color for the given technique
     * @param  technique     the technique to get the text color for
     * @param  antihighlight boolean, true if the column is not selected.
     * @return               black, white, or gray, depending on technique and column state
     */
    getTechniqueTextColor(technique: Technique, antihighlight: boolean) {
        let tvm = this.viewModel.getTechniqueVM(technique.technique_id)
        if (!tvm.enabled) return "#aaaaaa";
        // don't display if disabled or highlighted
        if (this.viewModel.highlightedTechnique && this.viewModel.highlightedTechnique.technique_id == technique.technique_id) return "black"
        if (tvm.color) return tinycolor.mostReadable(tvm.color, ["white", "black"]);
        if (tvm.score && !isNaN(Number(tvm.score))) return tinycolor.mostReadable(tvm.scoreColor, ["white", "black"]);
        if (antihighlight) return "#aaaaaa";
        else return "black"
    }

    /**
     * Is score input valid number
     * @param  event keypress event just in case we need it
     * @return       true if valid number
     */
    validateScoreInput(event) {
        // console.log(event)
        let result: boolean = isNaN(Number(this.scoreEditField))
        // console.log(result)
        return result
    }

    /**
     * return an acronym version of the given string
     * @param  words the string of words to get the acrnoym of
     * @return       the acronym string
     */
    acronym(words: string): string {
        let skipWords = ["on","and", "the", "with", "a", "an", "of", "in", "for", "from"]

        let result = "";
        let wordSplit = words.split(" ");
        if (wordSplit.length > 1) {
            let wordIndex = 0;
            // console.log(wordSplit);
            while (result.length < 4 && wordIndex < wordSplit.length) {
                if (skipWords.includes(wordSplit[wordIndex].toLowerCase())) {
                    wordIndex++;
                    continue;
                }

                //find first legal char of word
                for (let charIndex = 0; charIndex < wordSplit[wordIndex].length; charIndex++) {
                    let code = wordSplit[wordIndex].charCodeAt(charIndex);
                    if (code < 48 || (code > 57 && code < 65) || (code > 90 && code < 97) || code > 122) { //illegal character
                        continue;
                    } else {
                        result += wordSplit[wordIndex].charAt(charIndex).toUpperCase()
                        break;
                    }
                }

                wordIndex++;
            }

            return result;
        } else {
            return wordSplit[0].charAt(0).toUpperCase();
        }
    }

    /**
     * Return whether all techniques in the security instance are currently selected
     * @param  si SecurityInstance object
     * @return    true if all techniques of the instance are selected, false otherwise
     */
    isSecurityInstanceSelected(si: SecurityInstance): boolean {
        let self = this;
        let selected = true
        for (let i = 0; i < si.techniques.length; i++) {
            let techniqueID = si.techniques[i];
            if (!self.viewModel.isTechniqueSelected_id(techniqueID)) return false
        }
        return true;
    }


}

class SecurityInstance{
    name: string;
    type: string;
    id: string;
    techniques: string[];
    aliases: string[];
    url: string;

    constructor(name: string, type: string, id: string, url: string){
        this.name = name;
        this.type = type;
        this.id = id;
        this.techniques = [];
        this.url = url;
    }
}
